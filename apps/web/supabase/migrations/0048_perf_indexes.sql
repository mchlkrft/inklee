-- 0048: Performance indexes on hot tables that shipped with only a primary key.
--
-- Audit 2026-06-10: booking_requests, audit_log, slots, waitlist_entries and
-- booking_images were sequentially scanned on per-request hot paths (the artist
-- layout cap count, the mobile inbox, the unauthenticated /request/[token]
-- portal, the Stripe webhook deposit-idempotency lookup, public flash pages,
-- and dashboard/mobile-home counts). Degradation is linear with global table
-- size, so this lands before launch traffic.
--
-- All additive; no RLS or column changes. Plain (non-CONCURRENT) CREATE INDEX is
-- safe pre-launch (tables are small and this runs inside the migration
-- transaction). IF NOT EXISTS keeps the migration idempotent.

-- booking_requests — the single hottest table.
CREATE INDEX IF NOT EXISTS idx_booking_requests_artist_created
  ON booking_requests (artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_requests_artist_status
  ON booking_requests (artist_id, status);
-- Unauthenticated magic-link portal lookup (and customer RLS predicate).
CREATE INDEX IF NOT EXISTS idx_booking_requests_token_hash
  ON booking_requests (customer_token_hash)
  WHERE customer_token_hash IS NOT NULL;
-- Stripe charge.refunded lookup by intent.
CREATE INDEX IF NOT EXISTS idx_booking_requests_deposit_intent
  ON booking_requests (deposit_payment_intent_id)
  WHERE deposit_payment_intent_id IS NOT NULL;
-- FK columns (also support ON DELETE SET NULL / CASCADE maintenance).
CREATE INDEX IF NOT EXISTS idx_booking_requests_slot_id
  ON booking_requests (slot_id) WHERE slot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_requests_trip_id
  ON booking_requests (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_requests_flash_item_id
  ON booking_requests (flash_item_id) WHERE flash_item_id IS NOT NULL;

-- audit_log — append-only, fastest-growing; queried per booking-detail view,
-- per Stripe webhook (deposit_paid idempotency gate), and per cron iteration.
CREATE INDEX IF NOT EXISTS idx_audit_log_booking_action
  ON audit_log (booking_id, action);
-- Unauthenticated token-reuse check in /request/[token] (JSONB expression scan).
CREATE INDEX IF NOT EXISTS idx_audit_log_token_rotated_old_hash
  ON audit_log ((details->>'old_hash'))
  WHERE action = 'token_rotated';

-- slots — public page filters open future slots by artist.
CREATE INDEX IF NOT EXISTS idx_slots_artist_status_start
  ON slots (artist_id, status, starts_at);

-- waitlist_entries — dashboard + mobile home count 'waiting' entries per artist.
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_artist_status
  ON waitlist_entries (artist_id, status);

-- booking_images — embedded on every booking-detail fetch; FK cascade target.
CREATE INDEX IF NOT EXISTS idx_booking_images_booking_id
  ON booking_images (booking_id);
