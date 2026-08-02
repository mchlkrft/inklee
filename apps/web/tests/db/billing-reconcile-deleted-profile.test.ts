import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";

/**
 * BDEL-SUB-001 (remaining half, task #59) against a REAL schema.
 *
 * `reconcile.test.ts` (unit) proves the orchestration logic against an
 * in-memory store; it cannot prove a foreign-key violation, because a mock
 * has no constraint to violate. Only a real Postgres can show that writing
 * `billing_subscriptions`/`account_overrides` for an artist_id that no
 * longer exists in `profiles` is rejected at the database, not merely
 * "unexpected" by a test author's assertion.
 *
 * THE DEFECT. `resolveArtistId` in reconcile.ts reads `artist_id` off
 * Stripe subscription/customer metadata, which is a point-in-time snapshot
 * Stripe keeps forever -- including after the artist deletes their Inklee
 * account. Account deletion (`deleteOwnAccountCore` step 2b) cancels the
 * subscription in Stripe BEFORE deleting the profile row, so the
 * `customer.subscription.deleted` event that cancellation itself emits can
 * be delivered AFTER the profile (and its CASCADE-linked `account_overrides`
 * row) are already gone. Before this fix, `reconcileFromStripeSubscription`
 * would still attempt to write `billing_subscriptions`/`account_overrides`
 * against that dangling artist_id, and Postgres would reject it with 23503
 * (foreign key violation) -- surfacing as a webhook 500 rather than the
 * quiet no-op this scenario deserves.
 *
 * NO STRIPE KEY IS REACHABLE FROM THIS FILE (STRIPE_SECRET_KEY is absent
 * from .env.e2e -- same fact `payment-request-intent-race.test.ts`
 * documents). Every fake Stripe.Subscription below carries
 * `metadata.artist_id` directly, so `resolveArtistId` returns it without
 * ever calling `requireStripe().customers.retrieve`.
 */

let admin: SupabaseClient;

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { reconcileFromStripeSubscription } from "@/lib/server/billing/reconcile";

function makeSub(o: {
  subId: string;
  status: string;
  customer: string;
  artistId: string;
  priceId?: string;
}): Stripe.Subscription {
  const periodEnd = Math.floor(Date.now() / 1000) + 3600;
  return {
    id: o.subId,
    status: o.status,
    livemode: false,
    customer: o.customer,
    cancel_at_period_end: false,
    current_period_end: periodEnd,
    metadata: { artist_id: o.artistId, contract_customer_type: "business" },
    items: {
      data: [
        {
          price: { id: o.priceId ?? "price_plus" },
          current_period_end: periodEnd,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

// Rows this file seeds directly (bypassing reconcile) to model a subscription
// that had already converged BEFORE the profile was deleted. Tracked by their
// own PK/subscription id, since the retained/cascaded row can't be found by
// artist_id once the profile (and, for account_overrides, the row itself) is
// gone -- same discipline as account-deletion-retention.test.ts.
let preSeededSubRowId: string;

const actors: Actor[] = [];
async function deletedProfileActor(label: string): Promise<Actor> {
  const actor = await makeActor(admin, label);
  actors.push(actor);
  const { error } = await admin.from("profiles").delete().eq("id", actor.id);
  expect(error, error?.message).toBeNull();
  return actor;
}

beforeAll(async () => {
  admin = adminClient();
});

afterAll(async () => {
  if (preSeededSubRowId) {
    await admin.from("billing_subscriptions").delete().eq("id", preSeededSubRowId);
  }
  for (const actor of actors) {
    // The profile is already gone in every scenario; destroyActor tolerates
    // that (no-op) and still removes the auth user this file created.
    await destroyActor(admin, actor);
  }
});

describe("billing reconcile after the owning profile is deleted (BDEL-SUB-001)", () => {
  it("(a)+(b) a brand-new event for a deleted profile writes nothing and does not throw", async () => {
    const actor = await deletedProfileActor("bdelsub-fresh");
    const subId = `sub_bdelsub_fresh_${actor.id.slice(0, 8)}`;
    const customerId = `cus_bdelsub_fresh_${actor.id.slice(0, 8)}`;

    // WITHOUT THE FIX: resolveArtistId returns actor.id from metadata (never
    // checking whether the profile still exists), and reconcile proceeds to
    // guardedUpsert on billing_subscriptions. No row exists yet for `subId`,
    // so the UPDATE matches 0 rows, the SELECT finds nothing, and it falls
    // to `insert({ artist_id: actor.id, ... })` -- which violates
    // billing_subscriptions_artist_id_fkey (23503) because actor.id no
    // longer exists in `profiles`. guardedUpsert wraps any non-23505 insert
    // error and throws, so this call would REJECT instead of resolving.
    const result = await reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "canceled", // the deletion flow's own cancel() echo
        customer: customerId,
        artistId: actor.id,
      }),
      Math.floor(Date.now() / 1000),
    );

    expect(result.deletedProfile).toBe(true);
    expect(result.orphaned).toBe(false);
    expect(result.artistId).toBe(actor.id);

    const { data: subRow, error: subErr } = await admin
      .from("billing_subscriptions")
      .select("id")
      .eq("stripe_subscription_id", subId)
      .maybeSingle();
    expect(subErr, subErr?.message).toBeNull();
    expect(subRow).toBeNull();

    const { data: ovRow, error: ovErr } = await admin
      .from("account_overrides")
      .select("artist_id")
      .eq("artist_id", actor.id)
      .maybeSingle();
    expect(ovErr, ovErr?.message).toBeNull();
    expect(ovRow).toBeNull();

    // Terminal status (the routine cancellation echo): no operator alert.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (Sentry.captureMessage as any).mock.calls as unknown[][];
    const deletedProfileAlerts = calls.filter(
      (c) =>
        (c[1] as { tags?: { action?: string } })?.tags?.action ===
        "billing_reconcile_deleted_profile",
    );
    expect(deletedProfileAlerts).toHaveLength(0);
  });

  it("(a) a late event on an already-reconciled subscription updates nothing (the UPDATE path, not just INSERT)", async () => {
    const actor = await deletedProfileActor("bdelsub-update");
    const subId = `sub_bdelsub_update_${actor.id.slice(0, 8)}`;
    const customerId = `cus_bdelsub_update_${actor.id.slice(0, 8)}`;

    // Model a subscription that reconciled successfully BEFORE deletion:
    // insert directly (bypassing reconcile) with the artist still present.
    // Re-create the profile momentarily so the FK on this seed insert holds,
    // matching the real ordering (the row existed while the artist did).
    await admin.from("profiles").insert({
      id: actor.id,
      slug: `bdelsub-update-reseed-${actor.id.slice(0, 8)}`,
      display_name: "reseed",
    });
    const seeded = await admin
      .from("billing_subscriptions")
      .insert({
        artist_id: actor.id,
        stripe_customer_id: customerId,
        stripe_subscription_id: subId,
        stripe_price_id: "price_plus",
        status: "active",
        contract_customer_type: "business",
        mode: "test",
      })
      .select("id")
      .single();
    expect(seeded.error, seeded.error?.message).toBeNull();
    preSeededSubRowId = seeded.data!.id as string;

    // Now delete the profile for real: CASCADE erases nothing here (no
    // account_overrides row was seeded), SET NULL (0129) nullifies
    // billing_subscriptions.artist_id on the row we just created.
    const { error: delErr } = await admin
      .from("profiles")
      .delete()
      .eq("id", actor.id);
    expect(delErr, delErr?.message).toBeNull();

    const preCheck = await admin
      .from("billing_subscriptions")
      .select("artist_id, status")
      .eq("id", preSeededSubRowId)
      .single();
    expect(preCheck.data!.artist_id).toBeNull();
    expect(preCheck.data!.status).toBe("active");

    // WITHOUT THE FIX: guardedUpsert's guarded UPDATE matches this EXISTING
    // row by stripe_subscription_id and attempts to set
    // `artist_id = actor.id` back onto it. Postgres enforces a foreign key
    // on UPDATE of the referencing column exactly as it does on INSERT, so
    // this also 23503s on billing_subscriptions_artist_id_fkey.
    const result = await reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "canceled",
        customer: customerId,
        artistId: actor.id,
      }),
      Math.floor(Date.now() / 1000),
    );
    expect(result.deletedProfile).toBe(true);

    const postCheck = await admin
      .from("billing_subscriptions")
      .select("artist_id, status")
      .eq("id", preSeededSubRowId)
      .single();
    // Untouched: still nulled by the cascade, status still the pre-seeded
    // value (NOT overwritten to "canceled" by the late event), proving the
    // guarded UPDATE was never attempted.
    expect(postCheck.data!.artist_id).toBeNull();
    expect(postCheck.data!.status).toBe("active");

    const { data: ovRow } = await admin
      .from("account_overrides")
      .select("artist_id")
      .eq("artist_id", actor.id)
      .maybeSingle();
    expect(ovRow).toBeNull();
  });

  it("alerts on a genuinely LIVE Stripe status after deletion, a real money condition nobody at Inklee can see otherwise", async () => {
    const actor = await deletedProfileActor("bdelsub-live");
    const subId = `sub_bdelsub_live_${actor.id.slice(0, 8)}`;

    const result = await reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "active",
        customer: `cus_bdelsub_live_${actor.id.slice(0, 8)}`,
        artistId: actor.id,
      }),
      Math.floor(Date.now() / 1000),
    );
    expect(result.deletedProfile).toBe(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (Sentry.captureMessage as any).mock.calls as unknown[][];
    const alert = calls.find(
      (c) =>
        (c[1] as { tags?: { action?: string } })?.tags?.action ===
        "billing_reconcile_deleted_profile",
    );
    expect(alert).toBeTruthy();
    const extra = (alert![1] as { extra?: Record<string, unknown> }).extra;
    expect(extra?.artistId).toBe(actor.id);
    expect(extra?.status).toBe("active");
  });
});
