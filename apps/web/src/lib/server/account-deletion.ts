import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import {
  ORDER_MONEY_STATES,
  buildFinancialSnapshot,
  categorizeDepositBookings,
  pseudonymizeOrder,
  type DepositBookingRow,
} from "./account-deletion-logic";

// Shared core for in-app + web self-service + admin account deletion. The same
// audited path serves all three callers so the admin path's historical
// storage/Stripe-skipping bug can't be re-propagated.
//
// Design: docs/account-deletion-design-2026-06-08.md. Legal position:
// docs/account-deletion-handoff.md (counsel).
// Two non-negotiable facts this hinges on:
//   1) profiles.id has NO FK to auth.users, so deleting the auth user does NOT
//      cascade — the profiles delete is what fans out, and it must succeed.
//   2) Storage NEVER cascades — both buckets are purged by {artistId}/ prefix.
//
// ⚠️ Counsel §3: erasure is NOT blocked on financial resolution. Deletion always
// proceeds. Live unpaid intents are cancelled (transient retry, not a block);
// every paid deposit's PSEUDONYMISED record is retained (with a `resolved` flag)
// to preserve the client's refund route + the parties' legal claims. ⚠️ Counsel
// §4/§5: the retained record is pseudonymised (in-scope personal data), money +
// Stripe ids only, retained 7 years for Estonian accounting/tax law.

// Counsel §9: deletion must be confirmed by re-authentication immediately before
// the irreversible operation. last_sign_in_at is set by Supabase on a REAL
// sign-in (password or OAuth/Apple) and is NOT bumped by silent token refresh,
// so a recent value is server-side proof that the user just re-authenticated —
// which is exactly what the clients' re-auth step produces. Both deletion entry
// points (web action + mobile route) gate on this so the check lives on the
// enforceable side of the trust boundary, not only in the UI.
export const REAUTH_WINDOW_MS = 5 * 60 * 1000;
export function isReauthFresh(
  lastSignInAt: string | null | undefined,
): boolean {
  if (!lastSignInAt) return false;
  const t = Date.parse(lastSignInAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= REAUTH_WINDOW_MS;
}

export type DeleteAccountResult =
  | { ok: true }
  | {
      // ERROR is transient (e.g. Stripe unreachable / a live intent couldn't be
      // cancelled) → the caller surfaces "try again", it is NOT a financial block.
      ok: false;
      code: "ERROR";
      message: string;
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
 * already authenticated the user (incl. re-auth) and captured type-to-confirm
 * intent — this trusts `userId`. Per counsel §3 it always proceeds (no financial
 * block); it only returns a transient ERROR if Stripe is briefly unreachable.
 * Ordered so the irreversible profile cascade is a clean stop-point and storage
 * (prefix-based) is purged afterwards.
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

  // Capture the auth email up front — needed to purge this person's single-
  // purpose mobile launch-waitlist row(s) (keyed by email, no FK so the cascade
  // never reaches them), and it is gone once the auth user is deleted at step 6.
  const { data: authUserData } =
    await serviceClient.auth.admin.getUserById(userId);
  const userEmail = authUserData?.user?.email ?? null;

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

  const { liveUnpaid, paid } = categorizeDepositBookings(rows, resolvedIds);

  // Counsel §3: deletion is NOT blocked on financial resolution — it always
  // proceeds (no balance check, no "resolve your deposits first" gate). We still
  // cancel live unpaid intents below so no client pays into a gone account; if
  // Stripe is unreachable AND there are intents to cancel, that's a transient
  // system issue → ask the caller to retry. It is NOT a financial block.
  if (!stripe && liveUnpaid.length > 0) {
    return {
      ok: false,
      code: "ERROR",
      message:
        "Account deletion is temporarily unavailable. Please try again in a moment.",
    };
  }

  // 2. Cancel live unpaid PaymentIntents so no client can pay into a gone
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

  // 3. Retain the PSEUDONYMISED financial record BEFORE the cascade deletes it.
  //    Includes EVERY paid deposit (resolved + unresolved) — an unresolved one's
  //    record (intent id + amount + resolved:false) preserves the client's refund
  //    route per counsel §3. This insert is the ONLY DB-side survival of that
  //    refund pointer AND of the counsel-mandated 7-year record, so when there IS
  //    money to retain it MUST succeed before the step-4 cascade destroys the
  //    source rows. If it fails (e.g. migration 0047 not applied → "relation does
  //    not exist", or a transient DB error), STOP and surface a transient ERROR —
  //    nothing irreversible has happened yet (the intent cancels above are safe to
  //    repeat). Only when there is genuinely nothing to retain do we proceed.
  try {
    const { data: orders, error: ordersError } = await serviceClient
      .from("orders")
      .select("*")
      .eq("artist_id", userId)
      .in("status", ORDER_MONEY_STATES);
    if (ordersError) throw ordersError;
    const pseudonymizedOrders = (orders ?? []).map((o) =>
      pseudonymizeOrder(o as Record<string, unknown>),
    );
    if (paid.length > 0 || pseudonymizedOrders.length > 0) {
      const { error: archiveError } = await serviceClient
        .from("deleted_account_records")
        .insert({
          artist_id: userId,
          stripe_account_id: profile?.stripe_account_id ?? null,
          record: buildFinancialSnapshot(
            paid,
            resolvedIds,
            pseudonymizedOrders,
          ),
        });
      if (archiveError) throw archiveError;
    }
  } catch (e) {
    // There IS money/records to retain (or we couldn't even read orders to know)
    // and we could NOT persist the mandated record. Refusing here is strictly
    // safer than destroying the legally-required record + the unresolved client's
    // refund pointer in the cascade below. Surface as transient → caller retries.
    console.error("[account-deletion] financial archive failed:", e);
    return {
      ok: false,
      code: "ERROR",
      message:
        "Account deletion is temporarily unavailable. Please try again in a moment.",
    };
  }

  // 4. Delete the profiles row — THE cascade trigger. Must succeed or STOP
  //    (nothing irreversible has happened yet; intent cancels are safe).
  const { error: profileError } = await serviceClient
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileError) {
    return { ok: false, code: "ERROR", message: profileError.message };
  }

  // 5. Purge storage in both buckets by {userId}/ prefix (after the cascade —
  //    prefix-based, so it doesn't depend on the now-deleted rows).
  await purgeStoragePrefix("logos", userId);
  await purgeStoragePrefix("bookings", userId);

  // 6. Delete the auth user (tolerate not-found, as the admin path does).
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

  // 6b. Counsel §8: records that outlive the cascade must be PSEUDONYMOUS — a
  //     bare actor uuid + action + timestamp, with no name/email. Redact the
  //     free-form detail blobs that can carry PII on every row tied to this user:
  //     audit_log.details (booking_id-null rows survive the cascade) and
  //     admin_action_log.metadata (no FK, never cascades). action/actor/timestamp
  //     remain as the pseudonymous record. Best-effort — never blocks completion.
  const redacted = { redacted_on_account_deletion: true };
  await serviceClient
    .from("audit_log")
    .update({ details: redacted })
    .eq("actor", userId);
  // Admin-initiated actions mirror into audit_log with actor = the ADMIN's id and
  // details.target_user_id = THIS user (and can carry the user's display_name /
  // email in details, e.g. permanent_delete / password_reset). The actor scrub
  // above misses those, so also redact admin rows that target this user.
  await serviceClient
    .from("audit_log")
    .update({ details: redacted })
    .eq("event_category", "admin")
    .filter("details->>target_user_id", "eq", userId);
  await serviceClient
    .from("admin_action_log")
    .update({ metadata: redacted })
    .eq("target_user_id", userId);
  await serviceClient
    .from("admin_action_log")
    .update({ metadata: redacted })
    .eq("admin_user_id", userId);

  // 6c. Single-purpose mobile launch-waitlist consent (counsel/founder decision):
  //     delete this person's waitlist row(s). No FK → not reached by the cascade.
  //     (The launch-send path, when built, must also delete each row after it is
  //     emailed — the other half of the same decision.)
  if (userEmail) {
    // mobile_waitlist.email is stored lowercase (CHECK email = lower(email)).
    await serviceClient
      .from("mobile_waitlist")
      .delete()
      .eq("email", userEmail.toLowerCase());
  }

  // 7. Tombstone (booking_id null → survives the cascade; bare uuid, no live PII).
  //    Written AFTER the 6b redaction so this clean record is not itself redacted.
  await writeAudit({
    action: "account_deleted",
    actor: userId,
    category: "system",
    details: { surface: opts.surface },
  });

  return { ok: true };
}
