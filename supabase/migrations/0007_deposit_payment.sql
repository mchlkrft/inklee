ALTER TABLE booking_requests
  ADD COLUMN deposit_payment_intent_id TEXT,
  ADD COLUMN deposit_client_secret TEXT,
  ADD COLUMN deposit_paid_at TIMESTAMPTZ;
