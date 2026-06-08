import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import {
  ORDER_MONEY_STATES,
  anonymizeOrder,
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
  const PAGE = 1000;
  // Paginate each level — .list() returns at most `limit` entries with no
  // continuation, so a busy artist's files would otherwise be silently missed.
  for (let offset = 0; ; offset += PAGE) {
    const { data: entries } = await serviceClient.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset });
    const page = entries ?? [];
    for (const entry of page) {
      if (entry.id === null) {
        out.push(
          ...(await listAllStorageFiles(bucket, `${prefix}/${entry.name}`)),
        );
      } else {
        out.push(`${prefix}/${entry.name}`);
      }
    }
    if (page.length < PAGE) break;
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

  // A paid deposit is "resolved" (no client money owed) if it was refunded OR
  // forfeited on a client cancellation — both are derived from the audit log.
  // (A forfeited deposit is legitimately the artist's; it must not block.)
  const paidIds = rows.filter((r) => r.deposit_paid_at).map((r) => r.id);
  const resolvedIds = new Set<string>();
  if (paidIds.length) {
    const { data: resolved } = await serviceClient
      .from("audit_log")
      .select("booking_id")
      .in("action", ["deposit_refunded", "deposit_forfeited"])
      .in("booking_id", paidIds);
    for (const r of resolved ?? []) {
      if (r.booking_id) resolvedIds.add(r.booking_id as string);
    }
  }

  const { liveUnpaid, paid, paidUnresolved } = categorizeDepositBookings(
    rows,
    resolvedIds,
  );

  // If Stripe is unreachable (key unset/rotated) we can neither verify the
  // Connect balance nor cancel live intents — proceeding would orphan a
  // chargeable intent or miss a balance. Refuse when any Stripe state exists.
  if (!stripe && (rows.length > 0 || profile?.stripe_account_id)) {
    return {
      ok: false,
      code: "ERROR",
      message:
        "Account deletion is temporarily unavailable. Please try again later.",
    };
  }

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

  // 3. BLOCK on in-flight client money — nothing has been mutated yet. A
  //    non-zero balance includes a NEGATIVE balance (artist owes Stripe), which
  //    must also settle before the account can leave.
  if (paidUnresolved.length > 0 || connectedBalanceCents !== 0) {
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

  // 4. Cancel live unpaid PaymentIntents so no client can pay into a gone
  //    account. If any intent can't be CONFIRMED canceled, STOP before the
  //    cascade — deleting its booking row would orphan a still-chargeable intent
  //    (or strand money if it just succeeded in a race).
  if (stripe) {
    let cancelFailed = false;
    for (const b of liveUnpaid) {
      if (!b.deposit_payment_intent_id) continue;
      try {
        await stripe.paymentIntents.cancel(b.deposit_payment_intent_id);
      } catch {
        // cancel() also throws when the intent is already canceled/succeeded —
        // re-read the real status; only continue if it is genuinely canceled.
        let canceled = false;
        try {
          const pi = await stripe.paymentIntents.retrieve(
            b.deposit_payment_intent_id,
          );
          canceled = pi.status === "canceled";
        } catch {
          // couldn't verify — don't risk orphaning a chargeable intent
        }
        if (!canceled) cancelFailed = true;
      }
    }
    if (cancelFailed) {
      return {
        ok: false,
        code: "ERROR",
        message:
          "Couldn't cancel a pending card payment. Please try again in a moment.",
      };
    }
  }

  // 5. Archive the anonymized financial subset BEFORE the cascade deletes it.
  try {
    const { data: orders } = await serviceClient
      .from("orders")
      .select("*")
      .eq("artist_id", userId)
      .in("status", ORDER_MONEY_STATES);
    const anonymizedOrders = (orders ?? []).map((o) =>
      anonymizeOrder(o as Record<string, unknown>),
    );
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
    // sweepable. Record it (booking_id null → survives the cascade) so a sweep
    // can finish the auth-email erasure without manual digging, then surface.
    await writeAudit({
      action: "account_auth_delete_failed",
      actor: userId,
      category: "system",
      details: { message: authError.message },
    });
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
