-- Slice 79d (multi-currency deposits). A deposit is charged in the artist's
-- settlement currency (derived from their Stripe Connect country) so a
-- non-eurozone artist has no FX at payout. The currency is fixed on the
-- booking at deposit-request time and must stay consistent with the
-- PaymentIntent's currency. Existing deposits default to 'eur'.
ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS deposit_currency text NOT NULL DEFAULT 'eur';
