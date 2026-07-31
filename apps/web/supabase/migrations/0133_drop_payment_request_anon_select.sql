-- Security fix: drop the anon SELECT policies 0128 added on payment_requests
-- and payment_request_lines.
--
-- 0128's policies gate SELECT on `customer_token_hash is not null`, which is
-- "any row that has ever been sent", NOT "the row whose token you hold". The
-- token is never matched, so with the anon key any caller could read EVERY sent
-- payment request and its line items through PostgREST. 0128's header claimed
-- this "matches the booking_requests pattern"; it does not, and these were the
-- only two `for select to anon` policies in the whole migration set.
--
-- Nothing needs them. The client pay page (apps/web/src/app/pay/[token]/page.tsx)
-- reads exclusively through the service client, which bypasses RLS, so the token
-- gate lives in application code (hash lookup) rather than in an anon policy.
-- With these dropped, payment_requests and payment_request_lines have no anon
-- access at all, which is correct: the anon role should never read them directly.
--
-- Forward-only: 0128 is not edited. It was never applied to production (it lives
-- on feat/p5d-collections, unpushed), so this closes the hole before it ships.
-- Idempotent (drop if exists) and convergent (dropping a policy is unconditional).
-- See docs/audit/findings.yaml PAY-RLS-005.

drop policy if exists "anon_read_payment_request_by_token" on payment_requests;
drop policy if exists "anon_read_payment_request_lines" on payment_request_lines;
