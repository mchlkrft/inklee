// Shared helpers for Inklee billing TEST-MODE tooling.
//
// Safety: this library HARD-REFUSES to run against anything but a Stripe
// test-mode key (sk_test_ / rk_test_). It exists so the billing build can be
// exercised end to end against real Stripe test objects without any risk of
// touching live money. It is dev/ops tooling, not application code, and never
// ships in the web bundle.
//
// Key source order: process.env.STRIPE_SECRET_KEY, then apps/web/.env.local.
const fs = require('fs');
const path = require('path');

const STRIPE_VERSION = '2026-05-27.dahlia';
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENV_LOCAL = path.join(REPO_ROOT, 'apps', 'web', '.env.local');

function loadTestKey() {
  let key = process.env.STRIPE_SECRET_KEY;
  if (!key && fs.existsSync(ENV_LOCAL)) {
    const raw = fs.readFileSync(ENV_LOCAL, 'utf8');
    const m = raw.match(/^STRIPE_SECRET_KEY=\"?([^\"\n\r]+)/m);
    if (m) key = m[1];
  }
  if (!key) {
    throw new Error('No STRIPE_SECRET_KEY (checked env and apps/web/.env.local).');
  }
  if (!(key.startsWith('sk_test_') || key.startsWith('rk_test_'))) {
    throw new Error(
      'REFUSING to run: STRIPE_SECRET_KEY is not a test-mode key (' +
        key.slice(0, 8) +
        '...). This tool only ever runs in test mode.',
    );
  }
  return key;
}

// Flatten nested params into Stripe's bracket form-encoding:
//   { metadata: { a: 1 }, recurring: { interval: 'month' }, lookup_keys: ['x'] }
//   -> metadata[a]=1 & recurring[interval]=month & lookup_keys[0]=x
function encodeForm(obj, prefix, out) {
  out = out || new URLSearchParams();
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const name = prefix ? `${prefix}[${key}]` : key;
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      val.forEach((v, i) => {
        if (v !== null && typeof v === 'object') encodeForm(v, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(v));
      });
    } else if (typeof val === 'object') {
      encodeForm(val, name, out);
    } else {
      out.append(name, String(val));
    }
  }
  return out;
}

function makeClient(key) {
  key = key || loadTestKey();
  async function call(method, resource, params, idempotencyKey) {
    const url = 'https://api.stripe.com/v1/' + resource;
    const headers = {
      Authorization: 'Bearer ' + key,
      'Stripe-Version': STRIPE_VERSION,
    };
    let body;
    if (method === 'GET') {
      const qs = params ? encodeForm(params).toString() : '';
      const res = await fetch(url + (qs ? '?' + qs : ''), { method, headers });
      return { status: res.status, body: await res.json() };
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = params ? encodeForm(params).toString() : '';
    const res = await fetch(url, { method, headers, body });
    return { status: res.status, body: await res.json() };
  }
  return {
    key,
    get: (r, p) => call('GET', r, p),
    post: (r, p, idem) => call('POST', r, p, idem),
    del: (r) => call('DELETE', r),
  };
}

module.exports = { loadTestKey, makeClient, encodeForm, STRIPE_VERSION };
