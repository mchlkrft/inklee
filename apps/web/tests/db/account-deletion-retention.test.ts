import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";
import { deleteOwnAccountCore } from "@/lib/server/account-deletion";

/**
 * C1.10 — does a REAL account deletion retain what the Terms and Privacy
 * documents promise (billing/tax records, Accounting Act §12, Art. 17(3)(b)),
 * and erase everything else? docs/legal/account-deletion-handoff.md §§4-5,11
 * is the spec; docs/audit/findings.yaml BDEL-RET-001/BDEL-TTS-001/BDEL-SUB-001/
 * BDEL-PAY-001 are the findings this closes or confirms.
 *
 * WHY A REAL DELETE. A unit test against buildFinancialSnapshot proves the
 * function's output shape; it cannot prove the schema-level SET NULL/CASCADE
 * split actually holds, or that `deleteOwnAccountCore` reads the P9 tables
 * BEFORE the cascade destroys them. Only a real `deleteOwnAccountCore` call
 * against a real fixture, with the aftermath read back from Postgres, proves
 * that. `NO STRIPE KEY IS REACHABLE FROM THIS FILE` (STRIPE_SECRET_KEY is
 * absent from .env.e2e, so `@/lib/stripe` exports null — same fact
 * `payment-request-intent-race.test.ts` documents); the fixture is built so
 * every Stripe-touching branch in `deleteOwnAccountCore` is skipped: no live
 * unpaid deposit intent, and the billing subscription's status is `canceled`
 * (outside `ACTIVE_BILLING`), so step 2b never calls `stripe.subscriptions.cancel`.
 *
 * TABLE-BY-TABLE DECISION under test (see 0129 and 0143 for the full
 * reasoning):
 *   RETAIN (ON DELETE SET NULL, pseudonymised — artist_id becomes NULL, row
 *   survives): billing_subscriptions, billing_consent_records,
 *   transaction_tax_snapshots, billing_contract_confirmations,
 *   withdrawal_cases (all 0129), founder_offer_redemptions (0143),
 *   refunds, refund_lines (0147, C1.10 completion). The refund ledger is the
 *   sharpest case in the file: refunds.payment_request_id still points at a
 *   payment_request that DOES get cascade-erased in the same delete (P9
 *   stays CASCADE, archived not schema-preserved), so surviving here also
 *   proves the refund's own NO ACTION subject FK did not block that cascade
 *   — 0147 makes it DEFERRABLE INITIALLY DEFERRED for exactly this reason.
 *   ERASE (ON DELETE CASCADE, unchanged): account_overrides (pure
 *   entitlement/config, no revenue-substantiation role — 0143's decision).
 *   ARCHIVE THEN ERASE (P9, migration 0125 — BDEL-PAY-001): payment_requests,
 *   payment_request_lines, payment_collections, payment_allocations all stay
 *   CASCADE (their composite subject FKs cannot be SET NULL), so the ONLY
 *   surviving copy is the pseudonymised snapshot this test asserts lands in
 *   `deleted_account_records`.
 */

let admin: SupabaseClient;
let actor: Actor;

// Captured BEFORE deletion. For the RETAINED tables, artist_id becomes NULL
// post-delete, so the only way to find "our" row afterward is by its own
// primary key — a query by artist_id would find nothing whether the row
// survived-pseudonymised or was erased, and could not tell those apart.
let billingSubscriptionId: string;
let consentRecordId: string;
let taxSnapshotId: string;
let contractConfirmationId: string;
let withdrawalCaseId: string;
let founderRedemptionId: string;

let bookingId: string;
let requestId: string;
let lineId: string;
const PAYMENT_INTENT_ID = `pi_c110_${Date.now()}`;
let allocationId: string;
let refundId: string;
let refundLineId: string;

const FOUNDER_POLICY_VERSION = `c110-retention-test-${Date.now()}`;

let deletionResult: Awaited<ReturnType<typeof deleteOwnAccountCore>>;

beforeAll(async () => {
  admin = adminClient();
  actor = await makeActor(admin, "c110");

  // --- The five 0129 tables + the 0143 addition (all should SURVIVE). -----
  const sub = await admin
    .from("billing_subscriptions")
    .insert({
      artist_id: actor.id,
      stripe_customer_id: `cus_c110_${actor.id.slice(0, 8)}`,
      // Status OUTSIDE ACTIVE_BILLING ({active,trialing,past_due}) so step 2b
      // of deleteOwnAccountCore never calls stripe.subscriptions.cancel —
      // this fixture models an already-canceled subscription at deletion
      // time, not a live one, so the test needs no Stripe key.
      stripe_subscription_id: `sub_c110_${actor.id.slice(0, 8)}`,
      stripe_price_id: "price_c110_test",
      status: "canceled",
      contract_customer_type: "consumer",
      mode: "test",
    })
    .select("id")
    .single();
  expect(sub.error, sub.error?.message).toBeNull();
  billingSubscriptionId = sub.data!.id;

  const consent = await admin
    .from("billing_consent_records")
    .insert({
      artist_id: actor.id,
      consent_type: "terms_acceptance",
      consent_version: "v1",
      consented_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  expect(consent.error, consent.error?.message).toBeNull();
  consentRecordId = consent.data!.id;

  const tts = await admin
    .from("transaction_tax_snapshots")
    .insert({
      kind: "charge",
      artist_id: actor.id,
      tax_policy_version: "v1",
      seller_country: "EE",
      seller_vat_registered: false,
      tax_treatment: "standard",
      currency: "eur",
      net_minor: 300,
      vat_minor: 0,
      gross_minor: 300,
      price_tax_behavior: "inclusive",
      content_hash: `c110-hash-${actor.id}`,
    })
    .select("id")
    .single();
  expect(tts.error, tts.error?.message).toBeNull();
  taxSnapshotId = tts.data!.id;

  const confirmation = await admin
    .from("billing_contract_confirmations")
    .insert({ artist_id: actor.id })
    .select("id")
    .single();
  expect(confirmation.error, confirmation.error?.message).toBeNull();
  contractConfirmationId = confirmation.data!.id;

  const withdrawal = await admin
    .from("withdrawal_cases")
    .insert({ artist_id: actor.id })
    .select("id")
    .single();
  expect(withdrawal.error, withdrawal.error?.message).toBeNull();
  withdrawalCaseId = withdrawal.data!.id;

  const founder = await admin
    .from("founder_offer_redemptions")
    .insert({
      artist_id: actor.id,
      stripe_customer_id: `cus_c110_${actor.id.slice(0, 8)}`,
      cohort_position: 1,
      eligibility_reason: "eligible",
      policy_version: FOUNDER_POLICY_VERSION,
    })
    .select("id")
    .single();
  expect(founder.error, founder.error?.message).toBeNull();
  founderRedemptionId = founder.data!.id;

  // --- account_overrides: config, no schema change, should be ERASED. -----
  const overrides = await admin
    .from("account_overrides")
    .insert({
      artist_id: actor.id,
      admin_notes: "c110 fixture, must not survive",
    })
    .select("artist_id")
    .single();
  expect(overrides.error, overrides.error?.message).toBeNull();

  // --- P9: a SENT payment request with a line, a settled allocation (which
  //     auto-creates its payment_collections row via trigger, per 0125's
  //     header). All four tables stay CASCADE; the archive is the only
  //     surviving copy (BDEL-PAY-001). --------------------------------------
  const booking = await admin
    .from("booking_requests")
    .insert({ artist_id: actor.id })
    .select("id")
    .single();
  expect(booking.error, booking.error?.message).toBeNull();
  bookingId = booking.data!.id;

  const draft = await admin
    .from("payment_requests")
    .insert({
      artist_id: actor.id,
      booking_id: bookingId,
      total_minor: 0,
      // Proves this security-sensitive, non-allowlisted column never reaches
      // the retained archive (migration 0128).
      customer_token_hash: "should-not-survive-in-the-archive",
    })
    .select("id")
    .single();
  expect(draft.error, draft.error?.message).toBeNull();
  requestId = draft.data!.id;

  const line = await admin
    .from("payment_request_lines")
    .insert({
      request_id: requestId,
      artist_id: actor.id,
      name: "Full sleeve, session 2",
      // Free text: must never reach the retained archive (account-deletion-
      // logic.ts's PAYMENT_REQUEST_LINE_RETAINED_FIELDS excludes it).
      description: "As discussed with the client over Instagram DM",
      quantity: 1,
      unit_amount_minor: 5000,
      line_total_minor: 5000,
      classification: "tattoo_service",
    })
    .select("id")
    .single();
  expect(line.error, line.error?.message).toBeNull();
  lineId = line.data!.id;

  const send = await admin
    .from("payment_requests")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      total_minor: 5000,
      collects: "balance",
      fee_schedule_version: "v1",
    })
    .eq("id", requestId);
  expect(send.error, send.error?.message).toBeNull();

  const allocation = await admin
    .from("payment_allocations")
    .insert({
      artist_id: actor.id,
      booking_id: bookingId,
      request_id: requestId,
      line_id: lineId,
      payment_intent_id: PAYMENT_INTENT_ID,
      component: "deposit",
      amount_minor: 5000,
      collected_total_minor: 5000,
      status: "succeeded",
    })
    .select("id")
    .single();
  expect(allocation.error, allocation.error?.message).toBeNull();
  allocationId = allocation.data!.id;

  // --- Refund ledger (0139/0147, C1.10 completion): a refund event against
  //     the SENT payment_request above, plus its per-line record. Both
  //     should SURVIVE deletion, pseudonymised (artist_id null) — this is
  //     the fixture that proves 0147's fix, and specifically that the
  //     surviving refund does not block the payment_requests cascade it
  //     still points at (refunds_payment_request_fk, NO ACTION, deferred). ---
  const refund = await admin
    .from("refunds")
    .insert({
      domain: "appointment_payment",
      artist_id: actor.id,
      payment_request_id: requestId,
      refund_type: "full",
      fee_refund_case: "voluntary_full",
      status: "succeeded",
      amount_minor: 1000,
      stripe_refund_id: `re_c110_${actor.id.slice(0, 8)}`,
      idempotency_key: `idem-c110-${actor.id}`,
      initiated_by: actor.id,
    })
    .select("id")
    .single();
  expect(refund.error, refund.error?.message).toBeNull();
  refundId = refund.data!.id;

  const refundLine = await admin
    .from("refund_lines")
    .insert({
      refund_id: refundId,
      artist_id: actor.id,
      payment_request_id: requestId,
      payment_request_line_id: lineId,
      name_snapshot: "Full sleeve, session 2",
      quantity_refunded: 1,
      amount_minor: 1000,
    })
    .select("id")
    .single();
  expect(refundLine.error, refundLine.error?.message).toBeNull();
  refundLineId = refundLine.data!.id;

  // The REAL orchestration. No `stripe` key is configured for this suite
  // (see the file header), so this only exercises the DB-write side —
  // exactly the side under test.
  deletionResult = await deleteOwnAccountCore(actor.id, { surface: "web" });
}, 60_000);

afterAll(async () => {
  // The profile is gone; the retained rows now carry artist_id = NULL, so
  // they must be cleaned up by their own primary key. `destroyActor` no
  // longer has a profile to delete (already gone) and no auth user (already
  // deleted by deleteOwnAccountCore) — both are tolerated no-ops.
  await admin
    .from("billing_subscriptions")
    .delete()
    .eq("id", billingSubscriptionId);
  await admin
    .from("billing_consent_records")
    .delete()
    .eq("id", consentRecordId);
  await admin
    .from("transaction_tax_snapshots")
    .delete()
    .eq("id", taxSnapshotId);
  await admin
    .from("billing_contract_confirmations")
    .delete()
    .eq("id", contractConfirmationId);
  await admin.from("withdrawal_cases").delete().eq("id", withdrawalCaseId);
  await admin
    .from("founder_offer_redemptions")
    .delete()
    .eq("id", founderRedemptionId);
  await admin
    .from("deleted_account_records")
    .delete()
    .eq("artist_id", actor?.id);
  // Cleaned up by their own PK, same reasoning as the RETAIN tables above:
  // artist_id is null post-deletion (or, if the deletion under test failed,
  // still set) either way this must not depend on it.
  await admin.from("refund_lines").delete().eq("id", refundLineId);
  await admin.from("refunds").delete().eq("id", refundId);
  await destroyActor(admin, actor);
});

describe("account deletion retention (C1.10)", () => {
  it("deletion succeeds and the profile is gone", () => {
    expect(deletionResult, JSON.stringify(deletionResult)).toEqual({
      ok: true,
    });
  });

  it("BDEL-TTS-001 confirm: a tax snapshot row no longer blocks the cascade", async () => {
    // The whole suite already depends on this (every other assertion below
    // only makes sense if the delete actually completed), but it is asserted
    // directly too: this is exactly the row shape BDEL-TTS-001 found
    // permanently aborting `delete from profiles` before 0129.
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("id", actor.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("billing_subscriptions survives, pseudonymised (artist_id null, Stripe ids intact)", async () => {
    const { data, error } = await admin
      .from("billing_subscriptions")
      .select("artist_id, stripe_subscription_id, status")
      .eq("id", billingSubscriptionId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.artist_id).toBeNull();
    expect(data!.stripe_subscription_id).toBe(
      `sub_c110_${actor.id.slice(0, 8)}`,
    );
    expect(data!.status).toBe("canceled");
  });

  it("billing_consent_records survives, pseudonymised", async () => {
    const { data, error } = await admin
      .from("billing_consent_records")
      .select("artist_id, consent_type")
      .eq("id", consentRecordId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.artist_id).toBeNull();
    expect(data!.consent_type).toBe("terms_acceptance");
  });

  it("transaction_tax_snapshots survives, pseudonymised, and the append-only trigger allowed the SET NULL", async () => {
    const { data, error } = await admin
      .from("transaction_tax_snapshots")
      .select("artist_id, content_hash, net_minor")
      .eq("id", taxSnapshotId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.artist_id).toBeNull();
    expect(data!.content_hash).toBe(`c110-hash-${actor.id}`);
    expect(data!.net_minor).toBe(300);
  });

  it("billing_contract_confirmations survives, pseudonymised", async () => {
    const { data, error } = await admin
      .from("billing_contract_confirmations")
      .select("artist_id")
      .eq("id", contractConfirmationId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.artist_id).toBeNull();
  });

  it("withdrawal_cases survives, pseudonymised", async () => {
    const { data, error } = await admin
      .from("withdrawal_cases")
      .select("artist_id")
      .eq("id", withdrawalCaseId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.artist_id).toBeNull();
  });

  it("refunds survives, pseudonymised, still pointing at the erased payment_request (0147)", async () => {
    const { data, error } = await admin
      .from("refunds")
      .select("artist_id, payment_request_id, amount_minor, stripe_refund_id")
      .eq("id", refundId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.artist_id).toBeNull();
    // The payment_request itself is gone (P9 stays CASCADE, archived not
    // schema-preserved) — the refund's pointer to it is retained anyway, an
    // orphaned but honest reference, exactly like the deposit's
    // paymentIntentId in the older buildFinancialSnapshot record.
    expect(data!.payment_request_id).toBe(requestId);
    expect(data!.amount_minor).toBe(1000);
    expect(data!.stripe_refund_id).toBe(`re_c110_${actor.id.slice(0, 8)}`);
  });

  it("refund_lines survives, pseudonymised (0147)", async () => {
    const { data, error } = await admin
      .from("refund_lines")
      .select("artist_id, refund_id, name_snapshot, amount_minor")
      .eq("id", refundLineId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.artist_id).toBeNull();
    expect(data!.refund_id).toBe(refundId);
    expect(data!.name_snapshot).toBe("Full sleeve, session 2");
    expect(data!.amount_minor).toBe(1000);
  });

  it("founder_offer_redemptions survives, pseudonymised (0143's fix)", async () => {
    const { data, error } = await admin
      .from("founder_offer_redemptions")
      .select("artist_id, cohort_position, eligibility_reason, policy_version")
      .eq("id", founderRedemptionId)
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.artist_id).toBeNull();
    expect(data!.cohort_position).toBe(1);
    expect(data!.eligibility_reason).toBe("eligible");
    expect(data!.policy_version).toBe(FOUNDER_POLICY_VERSION);
  });

  it("account_overrides is fully erased (config, no retention obligation — 0143's decision)", async () => {
    const { data, error } = await admin
      .from("account_overrides")
      .select("artist_id")
      .eq("artist_id", actor.id);
    expect(error, error?.message).toBeNull();
    expect(data).toEqual([]);
  });

  it("P9 (payment_requests/lines/collections/allocations) are fully erased live", async () => {
    const [requests, lines, collections, allocations] = await Promise.all([
      admin.from("payment_requests").select("id").eq("id", requestId),
      admin.from("payment_request_lines").select("id").eq("id", lineId),
      admin
        .from("payment_collections")
        .select("payment_intent_id")
        .eq("payment_intent_id", PAYMENT_INTENT_ID),
      admin.from("payment_allocations").select("id").eq("id", allocationId),
    ]);
    expect(requests.error, requests.error?.message).toBeNull();
    expect(lines.error, lines.error?.message).toBeNull();
    expect(collections.error, collections.error?.message).toBeNull();
    expect(allocations.error, allocations.error?.message).toBeNull();
    expect(requests.data).toEqual([]);
    expect(lines.data).toEqual([]);
    expect(collections.data).toEqual([]);
    expect(allocations.data).toEqual([]);
  });

  it("BDEL-PAY-001: the erased P9 data survives ONLY inside the pseudonymised archive", async () => {
    const { data, error } = await admin
      .from("deleted_account_records")
      .select("record")
      .eq("artist_id", actor.id)
      .single();
    expect(error, error?.message).toBeNull();
    const record = data!.record as {
      schemaVersion: number;
      appointmentPayments: {
        requests: Record<string, unknown>[];
        lines: Record<string, unknown>[];
        collections: Record<string, unknown>[];
        allocations: Record<string, unknown>[];
      };
    };
    expect(record.schemaVersion).toBe(3);

    const { requests, lines, collections, allocations } =
      record.appointmentPayments;
    expect(requests).toEqual([
      expect.objectContaining({
        id: requestId,
        booking_id: bookingId,
        status: "sent",
        total_minor: 5000,
      }),
    ]);
    // The security-sensitive token column must never appear anywhere in the
    // archive, on ANY of the four sub-arrays.
    expect(JSON.stringify(record.appointmentPayments)).not.toMatch(
      /customer_token_hash|should-not-survive/i,
    );

    expect(lines).toEqual([
      expect.objectContaining({
        id: lineId,
        request_id: requestId,
        name: "Full sleeve, session 2",
        unit_amount_minor: 5000,
      }),
    ]);
    // The free-text description must never appear in the archive.
    expect(JSON.stringify(lines)).not.toMatch(/Instagram DM/i);
    expect(lines[0]).not.toHaveProperty("description");

    expect(collections).toEqual([
      expect.objectContaining({
        payment_intent_id: PAYMENT_INTENT_ID,
        booking_id: bookingId,
      }),
    ]);

    expect(allocations).toEqual([
      expect.objectContaining({
        id: allocationId,
        payment_intent_id: PAYMENT_INTENT_ID,
        component: "deposit",
        amount_minor: 5000,
        collected_total_minor: 5000,
        status: "succeeded",
      }),
    ]);

    // No artist_id anywhere in the appointment-payments subset (redundant
    // with the top-level deleted_account_records.artist_id column).
    expect(JSON.stringify(record.appointmentPayments)).not.toMatch(
      /artist_id/i,
    );
  });
});
