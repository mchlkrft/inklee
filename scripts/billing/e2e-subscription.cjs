// End-to-end TEST-MODE subscription verification.
//
// Proves the full ingest path: a real test-mode Stripe subscription -> Stripe
// webhook -> `stripe listen` -> the local /api/stripe/billing-webhook route ->
// reconcile -> billing_subscriptions + account_overrides in the DB. Then cancels
// and proves the downgrade path. Creates a throwaway profiles row (no auth user;
// profiles.id has no auth FK) and DELETES it at the end (cascading the billing
// rows), plus deletes the Stripe test customer.
//
// Prereqs: `stripe listen --forward-to localhost:PORT/api/stripe/billing-webhook`
// running, and `PORT=... next dev` up with STRIPE_BILLING_WEBHOOK_SECRET set.
// Test mode only (stripe-test-lib refuses a live key).
//
//   node scripts/billing/e2e-subscription.cjs
const crypto = require("crypto");
const fs = require("fs");
const { makeClient } = require("./stripe-test-lib.cjs");
const postgres = require("A:/WORK/inklee/node_modules/postgres/cjs/src/index.js");

const DB = fs
  .readFileSync("A:/WORK/inklee/apps/web/.env.local", "utf8")
  .match(/^DATABASE_URL=\"?([^\"\r\n]+)/m)[1];
const sql = postgres(DB, { ssl: "require", max: 1, idle_timeout: 6 });
const stripe = makeClient();
const PRICE_LOOKUP = "inklee_plus_monthly_eur_test";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(label, fn, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(1000);
  }
  return null;
}

async function main() {
  const artistId = crypto.randomUUID();
  const slug = "e2e-billing-" + artistId.slice(0, 8);
  let customerId = null;
  try {
    // 1. Throwaway test artist.
    await sql`insert into profiles (id, slug, display_name, timezone, booking_mode)
      values (${artistId}, ${slug}, ${"E2E Billing " + slug}, 'Europe/Berlin', 'preferred_date')`;
    console.log("[1] artist:", artistId);

    // 2. Price.
    const price = (await stripe.get("prices", { limit: 1, lookup_keys: [PRICE_LOOKUP] })).body.data[0];
    if (!price) throw new Error("price not found; run setup-test-plans.cjs");

    // 3. Customer with a default test card (source: tok_visa) + artist_id.
    const custRes = await stripe.post("customers", {
      email: `e2e-billing-${slug}@inklee.app`,
      name: "E2E Billing",
      source: "tok_visa",
      metadata: { artist_id: artistId, inklee_env: "test" },
    });
    if (custRes.status >= 300) throw new Error("customer create: " + JSON.stringify(custRes.body.error));
    const cust = custRes.body;
    customerId = cust.id;
    console.log("[3] customer:", cust.id, "default_source:", cust.default_source);

    // 4. Subscription (charges the default PM immediately -> active). Fires
    //    customer.subscription.created + invoice.paid.
    const subRes = await stripe.post("subscriptions", {
      customer: cust.id,
      items: [{ price: price.id }],
      metadata: { artist_id: artistId, contract_customer_type: "business" },
    });
    if (subRes.status >= 300) throw new Error("subscription create: " + JSON.stringify(subRes.body.error));
    const sub = subRes.body;
    console.log("[4] subscription:", sub.id, "status:", sub.status, "livemode:", sub.livemode);
    if (sub.livemode) throw new Error("ABORT: livemode subscription");

    // 5. Wait for the webhook -> reconcile to grant plus.
    const up = await poll("reconcile", async () => {
      const ov = await sql`select plan_tier, plan_source, subscription_status, stripe_subscription_id, current_period_end
        from account_overrides where artist_id=${artistId}`;
      const bs = await sql`select status, mode, contract_customer_type, stripe_price_id, stripe_customer_id
        from billing_subscriptions where artist_id=${artistId}`;
      if (bs.length && ov.length && ov[0].plan_tier === "plus") return { ov: ov[0], bs: bs[0] };
      return null;
    });
    if (!up) {
      console.log("[5] FAIL: not reconciled to plus within timeout");
    } else {
      console.log("[5] RECONCILED -> plus");
      console.log("    account_overrides:", JSON.stringify(up.ov));
      console.log("    billing_subscriptions:", JSON.stringify(up.bs));
      const okMirror =
        up.ov.subscription_status === "active" &&
        up.ov.plan_source === "paid" &&
        up.ov.stripe_subscription_id === sub.id &&
        up.bs.mode === "test" &&
        up.bs.contract_customer_type === "business" &&
        up.bs.stripe_customer_id === cust.id;
      console.log("    mirror correct:", okMirror ? "YES" : "NO");
    }

    // 6. Cancel -> downgrade to free.
    if (up) {
      await stripe.del(`subscriptions/${sub.id}`);
      console.log("[6] cancelled subscription; waiting for downgrade...");
      const down = await poll("downgrade", async () => {
        const ov = await sql`select plan_tier, subscription_status from account_overrides where artist_id=${artistId}`;
        if (ov.length && ov[0].plan_tier === "free") return ov[0];
        return null;
      }, 25);
      console.log("[6]", down ? "DOWNGRADED -> free: " + JSON.stringify(down) : "FAIL: not downgraded within timeout");
    }
  } finally {
    // 7. Cleanup: delete the profile (cascades billing rows) + the Stripe customer.
    try {
      await sql`delete from profiles where id=${artistId}`;
      console.log("[7] deleted test profile (cascaded billing rows)");
    } catch (e) {
      console.log("[7] profile cleanup error:", e.message);
    }
    if (customerId) {
      try {
        await stripe.del(`customers/${customerId}`);
        console.log("[7] deleted Stripe test customer");
      } catch (e) {
        console.log("[7] customer cleanup error:", e.message);
      }
    }
    await sql.end();
  }
}

main().catch(async (e) => {
  console.error("E2E error:", e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});
