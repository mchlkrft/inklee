// Create a TEST-MODE B2B subscription Checkout Session, to prove the flow end
// to end against real Stripe test objects. Test mode only (enforced by lib).
//
//   node scripts/billing/create-test-checkout.cjs
//
// Demonstrates: subscription mode, VAT-ID collection (tax_id_collection), a
// required billing address (needed for place-of-supply), no payment_method_types
// (dynamic methods per the Stripe skill), and metadata that tags this as the
// isolated subscription flow (never a deposit). Prints a Checkout URL you can
// open in a browser and complete with Stripe test card 4242 4242 4242 4242.
const { makeClient } = require('./stripe-test-lib.cjs');

const PRICE_LOOKUP = 'inklee_plus_monthly_eur_test';

async function main() {
  const stripe = makeClient();

  const priceRes = await stripe.get('prices', { limit: 1, lookup_keys: [PRICE_LOOKUP] });
  const price = (priceRes.body.data || [])[0];
  if (!price) throw new Error('price not found; run setup-test-plans.cjs first');

  // A test business customer. In production this is created/looked-up server-side
  // and pinned to the Inklee account id; here it is a disposable test record.
  const custRes = await stripe.post(
    'customers',
    {
      email: 'test-b2b@inklee.app',
      name: 'Test Studio OU',
      metadata: {
        inklee_env: 'test',
        contract_customer_type: 'business',
        business_use_declared: 'true',
        classification_source: 'self_declared',
      },
    },
    'inklee-test-b2b-customer-v1',
  );
  if (custRes.status >= 300) throw new Error('customer failed: ' + JSON.stringify(custRes.body.error));
  const customer = custRes.body;
  console.log('customer     :', customer.id, '| livemode:', customer.livemode);

  const sessionRes = await stripe.post('checkout/sessions', {
    mode: 'subscription',
    customer: customer.id,
    line_items: [{ price: price.id, quantity: 1 }],
    // B2B place-of-supply + VAT id capture. NO payment_method_types (dynamic).
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    customer_update: { address: 'auto', name: 'auto' },
    subscription_data: {
      metadata: {
        inklee_env: 'test',
        billing_flow: 'plus_subscription',
        entitlement_package: 'plus_v1',
        contract_customer_type: 'business',
      },
    },
    // Distinct metadata namespace from deposits (never booking_id / artist_id here).
    metadata: {
      inklee_env: 'test',
      billing_flow: 'plus_subscription',
      contract_customer_type: 'business',
    },
    client_reference_id: 'test-artist-0001',
    success_url: 'https://inklee.app/settings/billing?checkout=success&session={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://inklee.app/settings/billing?checkout=cancelled',
  });
  if (sessionRes.status >= 300) throw new Error('session failed: ' + JSON.stringify(sessionRes.body.error));
  const s = sessionRes.body;

  console.log('session      :', s.id, '| livemode:', s.livemode);
  console.log('mode         :', s.mode);
  console.log('status       :', s.status);
  console.log('currency     :', s.currency);
  console.log('amount_total :', s.amount_total);
  console.log('---');
  console.log('CHECKOUT URL :', s.url);
  if (s.livemode) throw new Error('ABORT: session livemode=true. Must never happen in test tooling.');
}

main().catch((e) => {
  console.error('checkout error:', e.message);
  process.exit(1);
});
