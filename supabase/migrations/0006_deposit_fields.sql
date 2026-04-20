ALTER TABLE booking_requests
  ADD COLUMN deposit_amount NUMERIC(10, 2),
  ADD COLUMN deposit_due_at DATE,
  ADD COLUMN deposit_note TEXT;
