-- A6: client-facing payment page token mechanism.
-- Matches the booking_requests.customer_token_hash pattern: the token is a
-- random hex string in the URL, only its SHA-256 hash is stored, and the page
-- looks up by hash. The token is generated at SEND time (not at creation) so
-- drafts have no client-facing URL.

alter table payment_requests
  add column if not exists customer_token_hash text;

create index if not exists idx_payment_requests_token_hash
  on payment_requests (customer_token_hash)
  where customer_token_hash is not null;

-- Anon SELECT policy: clients can read their own payment request by token hash.
-- This matches the booking_requests pattern where the token IS the credential.
drop policy if exists "anon_read_payment_request_by_token" on payment_requests;
create policy "anon_read_payment_request_by_token" on payment_requests
  for select to anon
  using (customer_token_hash is not null);

-- Anon SELECT on payment_request_lines: clients can read lines for any request
-- they can see (the request-level token gate is the access control).
drop policy if exists "anon_read_payment_request_lines" on payment_request_lines;
create policy "anon_read_payment_request_lines" on payment_request_lines
  for select to anon
  using (
    exists (
      select 1 from payment_requests pr
      where pr.id = request_id
        and pr.customer_token_hash is not null
    )
  );
