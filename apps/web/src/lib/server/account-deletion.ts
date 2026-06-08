import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import {
  buildFinancialSnapshot,
  categorizeDepositBookings,
  type DepositBookingRow,
} from "./account-deletion-logic";

// Shared core for in-app + web self-service + admin account deletion. The same
// audited path serves all three callers so the admin path's historical
// storage/Stripe-skipping bug can't be re-propagated.
//
// Design + decisions: docs/account-deletion-design-2026-06-08.md.
// Two non-negotiable facts this hinges on:
//   1) profiles.id has NO FK to auth.users, so deleting the auth user does NOT
//      cascade — the profiles delete is what fans out, and it must succeed.
//   2) Storage NEVER cascades — both buckets are purged by {artistId}/ prefix.
//
// ⚠️ Money safety (founder-approved v1): BLOCK deletion when paid-unresolved
// deposits or a non-zero Connect balance exist (artist is merchant of record;
// auto-refund is a v2 enhancement). ⚠️ Financial retention: anonymize-and-retain
// a conservative subset (money + Stripe ids, no client PII) — exact field set +
// window PENDING COUNSEL.

export type DeleteAccountResult =
  | { ok: true }
  | {
      ok: false;
      code: "MONEY_NOT_RESOLVED" | "ERROR";
      message: string;
      details?: { unresolvedDeposits: number; connectedBalanceCents: number };
    };

// ── Storage purge (service-role; both buckets are RLS-locked) ────────────────

// Supabase .list() is non-recursive (folders come back with a null id), so we
// descend each level. Files are removed in batches.
async function listAllStorageFiles(
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const out: string[] = [];
  const { data: entries } = await serviceClient.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });
  for (const entry of entries ?? []) {
    if (entry.id === null) {
      out.push(
        ...(await listAllStorageFiles(bucket, `${prefix}/${entry.name}`)),
      );
    } else {
      out.push(`${prefix}/${entry.name}`);
    }
  }
  return out;
}

async function purgeStoragePrefix(
  bucket: string,
  prefix: string,
): Promise<void> {
  let files: string[] = [];
  try {
    files = await listAllStorageFiles(bucket, prefix);
  } catch {
    return; // best-effort; transient storage error must not abort the delete
  }
  for (let i = 0; i < files.length; i += 100) {
    try {
      await serviceClient.storage.from(bucket).remove(files.slice(i, i + 100));
    } catch {
      // continue; idempotent vs the cron cleanup
    }
  }
}

// ── Orchestration ───────────────────────────────────────────────────────────

/**
 * Irreversibly delete the artist identified by `userId`. The caller MUST have
 * already authenticated the user and confirmed intent — this trusts `userId`.
 * Ordered so the irreversible profile cascade is a clean stop-point and storage
 * (prefix-based) is purged afterwards. Returns MONEY_NOT_RESOLVED without
 * mutating anything when client money is in flight.
 */
export async function deleteOwnAccountCore(
  userId: string,
  opts: { surface: "mobile" | "web" | "admin" },
): Promise<DeleteAccountResult> {
  // 1. Profile (for the Connect account) + deposit bookings (money pre-flight).
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", userId)
    .single();

  const { data: depositRows } = await serviceClient
    .from("booking_requests")
    .select(
      "id, deposit_payment_intent_id, deposit_paid_at, deposit_amount, deposit_currency",
    )
    .eq("artist_id", userId)
    .not("deposit_payment_intent_id", "is", null);
  const rows = (depositRows ?? []) as DepositBookingRow[];

  // Refund state is derived from the audit log (no dedicated column).
  const paidIds = rows.filter((r) => r.deposit_paid_at).map((r) => r.id);
  const refundedIds = new Set<string>();
  if (paidIds.length) {
    const { data: refunds } = await serviceClient
      .from("audit_log")
      .select("booking_id")
      .eq("action", "deposit_refunded")
      .in("booking_id", paidIds);
    for (const r of refunds ?? []) {
      if (r.booking_id) refundedIds.add(r.booking_id as string);
    }
  }

  const { liveUnpaid, paid, paidUnresolved } = categorizeDepositBookings(
    rows,
    refundedIds,
  );

  // 2. Connected-account Stripe balance (available + pending). The
  //    Stripe-Account header is the request-options arg, not the params.
  let connectedBalanceCents = 0;
  if (profile?.stripe_account_id && stripe) {
    try {
      const balance = await stripe.balance.retrieve(
        {},
        { stripeAccount: profile.stripe_account_id },
      );
      connectedBalanceCents = [...balance.available, ...balance.pending].reduce(
        (sum, b) => sum + b.amount,
        0,
      );
    } catch {
      // Account restricted/disconnected/missing → no reachable funds, treat as 0.
    }
  }

  // 3. BLOCK on in-flight client money — nothing has been mutated yet.
  if (paidUnresolved.length > 0 || connectedBalanceCents > 0) {
    return {
      ok: false,
      code: "MONEY_NOT_RESOLVED",
      message:
        "You have unresolved paid deposits or a pending Stripe balance. Resolve or refund those and let any payout settle before deleting your account.",
      details: {
        unresolvedDeposits: paidUnresolved.length,
        connectedBalanceCents,
      },
    };
  }

  // 4. Cancel live unpaid PaymentIntents so no client can pay into a gone account.
  if (stripe) {
    for (const b of liveUnpaid) {
      if (!b.deposit_payment_intent_id) continue;
      try {
        await stripe.paymentIntents.cancel(b.deposit_payment_intent_id);
      } catch {
        // already canceled/expired — idempotent best-effort
      }
    }
  }

  // 5. Archive the anonymized financial subset BEFORE the cascade deletes it.
  try {
    const { data: orders } = await serviceClient
      .from("orders")
      .select("*")
      .eq("artist_id", userId);
    const anonymizedOrders = (orders ?? []).map((o) => {
      const { client_email: _clientEmail, ...rest } = o as Record<
        string,
        unknown
      >;
      return rest;
    });
    if (paid.length > 0 || anonymizedOrders.length > 0) {
      await serviceClient.from("deleted_account_records").insert({
        artist_id: userId,
        stripe_account_id: profile?.stripe_account_id ?? null,
        record: buildFinancialSnapshot(paid, anonymizedOrders),
      });
    }
  } catch (e) {
    // Non-fatal: Stripe retains the authoritative transaction records. Don't
    // strand a half-deleted account because the local archive write failed.
    console.error("[account-deletion] financial archive failed:", e);
  }

  // 6. Delete the profiles row — THE cascade trigger. Must succeed or STOP
  //    (nothing irreversible has happened yet; intent cancels are safe).
  const { error: profileError } = await serviceClient
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileError) {
    return { ok: false, code: "ERROR", message: profileError.message };
  }

  // 7. Purge storage in both buckets by {userId}/ prefix (after the cascade —
  //    prefix-based, so it doesn't depend on the now-deleted rows).
  await purgeStoragePrefix("logos", userId);
  await purgeStoragePrefix("bookings", userId);

  // 8. Delete the auth user (tolerate not-found, as the admin path does).
  const { error: authError } =
    await serviceClient.auth.admin.deleteUser(userId);
  if (authError && !/not found|does not exist/i.test(authError.message)) {
    // Profile + all PII are already gone; an orphaned auth row (email only) is
    // sweepable. Surface so the caller can retry the auth delete.
    return { ok: false, code: "ERROR", message: authError.message };
  }

  // 9. Tombstone (booking_id null → survives the cascade; bare uuid, no live PII).
  await writeAudit({
    action: "account_deleted",
    actor: userId,
    category: "system",
    details: { surface: opts.surface },
  });

  return { ok: true };
}
