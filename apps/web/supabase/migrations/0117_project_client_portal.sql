-- Project client portal + notification state (Plus build P4 follow-up).
--
-- P4 shipped the artist's side of large-project mode. This adds the half the
-- client sees: a tokenised page where the person who sent the enquiry can
-- check what they submitted and where it stands. Without it, a client fills in
-- a long intake, gets a generic confirmation screen, and then has no way to
-- see anything ever again.
--
-- The token follows the booking portal's design exactly (migration 0004): only
-- the SHA-256 hash is stored, so the database never holds a credential that
-- would grant access if it leaked, and the plaintext exists only in the email
-- that carried it.

alter table projects
  -- Nullable because it is generated at intake and older rows predate it. A
  -- project without one simply has no portal link, which is the honest state.
  add column if not exists customer_token_hash text,
  -- Which status the client was last told about. The artist moves a project
  -- through several states, and a status email must fire on the TRANSITION
  -- rather than on every save, or an artist editing their private note would
  -- email the client about nothing.
  add column if not exists client_notified_status text;

-- The portal lookup. Unique so a hash collision (or a bad regeneration) can
-- never resolve to two projects, and partial so the many rows without a token
-- do not sit in it.
create unique index if not exists projects_customer_token_idx
  on projects (customer_token_hash)
  where customer_token_hash is not null;
