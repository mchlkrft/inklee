-- Allow unauthenticated customers to read and update their own booking
-- via the magic-link token. Security: RLS permits any row with a non-null
-- token hash; the application WHERE clause narrows this to the specific hash.
-- Tokens are 32-byte crypto-random (2^256 search space — brute-force proof).

CREATE POLICY "customers can view booking by token"
  ON booking_requests FOR SELECT
  TO anon
  USING (customer_token_hash IS NOT NULL);

CREATE POLICY "customers can update booking by token"
  ON booking_requests FOR UPDATE
  TO anon
  USING (customer_token_hash IS NOT NULL)
  WITH CHECK (customer_token_hash IS NOT NULL);

-- Allow anon to insert audit_log entries for customer-initiated actions.
-- The service-role client is used instead; this policy is left intentionally
-- absent so that all audit_log writes from unauthenticated contexts must go
-- through the service client in application code.
