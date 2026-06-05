-- Account status on profiles
ALTER TABLE profiles
  ADD COLUMN account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'archived')),
  ADD COLUMN suspended_at  timestamptz,
  ADD COLUMN suspended_reason text,
  ADD COLUMN deleted_at    timestamptz,
  ADD COLUMN deleted_by    uuid;

-- Dedicated admin action log (separate from audit_log which is booking-centric)
-- Only accessible via service role — no RLS policies needed for internal admin use.
CREATE TABLE admin_action_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   uuid NOT NULL,
  target_user_id  uuid,                          -- nullable: target may be soft-deleted
  action          text NOT NULL,
  reason          text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Prevent accidental public access even though we only use service role
ALTER TABLE admin_action_log ENABLE ROW LEVEL SECURITY;
-- No policies: service role bypasses RLS; anon/artist roles have zero access
