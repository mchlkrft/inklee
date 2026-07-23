// Idempotently create the Inklee Plus TEST-MODE product and price in Stripe.
//
// Test mode only (enforced by stripe-test-lib). Safe to run repeatedly:
// find-or-create by a stable product metadata key and a stable price lookup_key.
//
//   node scripts/billing/setup-test-plans.cjs
//
// The amount here is a PLACEHOLDER (EUR 2.00/mo) tagged placeholder=true. The
// real commercial amount is a FOUNDER DECISION and is set on a fresh Price when
// decided. tax_behavior=exclusive encodes the B2B net display convention
// (decision-pack section E); a consumer inclusive Price is a separate object.
const { makeClient } = require('./stripe-test-lib.cjs');

const PRODUCT_KEY = 'plus';
const PRODUCT_NAME = 'Inklee Plus (test)';
const PRICE_LOOKUP = 'inklee_plus_monthly_eur_test';
const AMOUNT_MINOR = 200; // EUR 2.00 placeholder
const CURRENCY = 'eur';

async function findProduct(stripe) {
  const res = await stripe.get('products', { limit: 100, active: true });
  return (res.body.data || []).find(
    (p) => p.metadata && p.metadata.inklee_product_key === PRODUCT_KEY,
  );
}

async function findPrice(stripe) {
  const res = await stripe.get('prices', { limit: 1, lookup_keys: [PRICE_LOOKUP] });
  return (res.body.data || [])[0];
}

(async () => {
  const stripe = makeClient();

  let product = await findProduct(stripe);
  if (!product) {
    const res = await stripe.post(
      'products',
      {
        name: PRODUCT_NAME,
        metadata: {
          inklee_product_key: PRODUCT_KEY,
          inklee_env: 'test',
          entitlement_package: 'plus_v1',
        },
      },
      'inklee-setup-product-plus-test-v1',
    );
    if (res.status >= 300) throw new Error('product create failed: ' + JSON.stringify(res.body.error));
    product = res.body;
    console.log('CREATED product', product.id);
  } else {
    console.log('REUSED  product', product.id);
  }

  let price = await findPrice(stripe);
  if (!price) {
    const res = await stripe.post(
      'prices',
      {
        product: product.id,
        currency: CURRENCY,
        unit_amount: AMOUNT_MINOR,
        recurring: { interval: 'month' },
        tax_behavior: 'exclusive',
        lookup_key: PRICE_LOOKUP,
        nickname: 'Plus monthly EUR (test placeholder)',
        metadata: {
          inklee_price_key: PRICE_LOOKUP,
          inklee_env: 'test',
          placeholder: 'true',
          commercial_package: 'plus_monthly',
          entitlement_package: 'plus_v1',
          note: 'B2B net/exclusive placeholder; real amount is a FOUNDER DECISION',
        },
      },
      'inklee-setup-price-plus-monthly-eur-test-v1',
    );
    if (res.status >= 300) throw new Error('price create failed: ' + JSON.stringify(res.body.error));
    price = res.body;
    console.log('CREATED price  ', price.id);
  } else {
    console.log('REUSED  price  ', price.id);
  }

  console.log('---');
  console.log('livemode      :', price.livemode);
  console.log('product.id    :', product.id);
  console.log('price.id      :', price.id);
  console.log('lookup_key    :', price.lookup_key);
  console.log('unit_amount   :', price.unit_amount, price.currency);
  console.log('recurring     :', price.recurring && price.recurring.interval);
  console.log('tax_behavior  :', price.tax_behavior);
  if (price.livemode) throw new Error('ABORT: created object is livemode=true. This must never happen in test tooling.');
})().catch((e) => {
  console.error('setup error:', e.message);
  process.exit(1);
});
