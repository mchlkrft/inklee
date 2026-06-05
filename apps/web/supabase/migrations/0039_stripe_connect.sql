-- OT-12 Stripe Connect (slice OT-12.1): per-artist connected account state.
--
-- Stores the artist's Stripe Connect Express account id + the derived state
-- we sync from `account.updated` webhooks. Read-only in OT-12.1 — money flow
-- is unchanged until the next slice wires `requestDeposit` and
-- `prepareCheckoutAction` to use `on_behalf_of` + `transfer_data.destination`.
--
-- Status enum-as-text so future Stripe values (e.g. `requirements.disabled_reason`
-- specific cases) don't need a migration. `src/lib/stripe-connect.ts`
-- `deriveConnectStatus` is the single decoder.
--
--   unset       no Connect account on file
--   pending     onboarding incomplete; account exists but charges_enabled=false
--   active      account ready (charges_enabled + payouts_enabled + no
--               currently_due requirements blocking activity)
--   restricted  Stripe has requirements / capabilities issues; charges may
--               still work but flag the artist
--   disabled    account disabled by Stripe; no charges
--
-- See docs/ot-12-stripe-connect-plan.md for the full slice plan.

ALTER TABLE profiles
  ADD COLUMN stripe_account_id text,
  ADD COLUMN stripe_account_status text NOT NULL DEFAULT 'unset',
  ADD COLUMN stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN stripe_account_country text,
  ADD COLUMN stripe_account_updated_at timestamptz;

COMMENT ON COLUMN profiles.stripe_account_id IS
  'Stripe Connect account id (acct_*) for OT-12. NULL means the artist has not started onboarding.';
COMMENT ON COLUMN profiles.stripe_account_status IS
  'OT-12 derived status: unset|pending|active|restricted|disabled. Decoder lives in src/lib/stripe-connect.ts.';

-- Lookup by stripe_account_id is rare (only inside webhook dispatch) so a
-- partial index keeps it cheap. `IS NOT NULL` partial avoids indexing the
-- bulk of un-connected artists.
CREATE INDEX IF NOT EXISTS profiles_stripe_account_id_idx
  ON profiles (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;
