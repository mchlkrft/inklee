-- Deposit-policy snapshot (Q9, 2026-06-03). Source: legal package draft
-- Section 9 §§12-14 + payment-flow-for-counsel.md.
--
-- The artist's EDITABLE deposit policy lives in profiles.settings.deposit_policy
-- (JSONB, no migration — same pattern as deposit_defaults / dashboard_widgets).
-- It is a STRUCTURED chooser (refund window + late-cancel forfeit % from a
-- constrained list + optional last-minute 100% window). Reciprocity (artist
-- cancels => full client refund) is hard-coded in app logic, not stored, and not
-- artist-overridable.
--
-- When a client pays an in-app deposit, the policy at that moment is FROZEN onto
-- the booking so later edits never change what the client agreed to. These two
-- columns are that frozen copy, used in the post-payment email, the magic-link
-- portal, and the dashboard:
--   deposit_policy           the structured params as-of payment (jsonb)
--   deposit_policy_snapshot  the rendered client-facing policy text (durable medium)

ALTER TABLE booking_requests
  ADD COLUMN deposit_policy          jsonb,
  ADD COLUMN deposit_policy_snapshot text;

COMMENT ON COLUMN booking_requests.deposit_policy IS
  'Q9: structured deposit-policy params frozen at deposit payment time. Editable source is profiles.settings.deposit_policy.';
COMMENT ON COLUMN booking_requests.deposit_policy_snapshot IS
  'Q9: rendered client-facing deposit-policy text frozen at payment time (durable medium for the confirmation email + portal).';
