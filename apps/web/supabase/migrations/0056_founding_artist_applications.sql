-- 0056 — founding_artist_applications
--
-- Backs the public /founding-artists beta application form. One row per
-- applicant. The beta is invite-only and reviewed manually, so this table is
-- both the public capture surface and the admin review queue.
--
-- SERVICE-ROLE ONLY (same pattern as mobile_waitlist + account_overrides): RLS
-- is enabled with NO policies. Public submissions are inserted by the server
-- action via the service-role client (rate-limited + validated at the edge),
-- and the admin review UI reads/updates via the service client too. The repo is
-- public and there is no anon policy, so applications can never be read,
-- enumerated, or modified by the public, and internal review fields
-- (application_status, internal_notes, reviewer) are never exposed.
--
-- Privacy / consent: rows represent an explicit opt-in. The form requires both
-- consent_privacy (privacy-policy acceptance) and consent_beta_communication
-- (agreeing to receive beta-related email); the server action rejects a
-- submission unless both are true.

CREATE TABLE IF NOT EXISTS founding_artist_applications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Applicant (required)
  artist_name             text NOT NULL,
  email                   text NOT NULL,
  instagram_handle        text NOT NULL,   -- normalised: no leading @, lowercased
  instagram_url           text,            -- derived https://instagram.com/<handle>
  country                 text NOT NULL,
  city                    text NOT NULL,
  tattoo_style            text NOT NULL,
  career_stage            text NOT NULL,   -- e.g. apprentice | early | established | veteran
  artist_type             text NOT NULL,   -- solo | traveling | studio_artist | studio_owner
  current_booking_method  text NOT NULL,
  monthly_request_volume  text NOT NULL,   -- bucketed string (e.g. '1-10','11-30',...)
  primary_problem         text NOT NULL,
  device_platform         text NOT NULL,   -- ios | android
  reason_for_joining      text NOT NULL,

  -- Applicant (optional)
  website_url             text,
  studio_name             text,
  referral_source         text,
  books_open_date         date,
  guest_spot_details      text,
  additional_notes        text,

  -- Consent (both must be true to submit; enforced in the server action)
  consent_beta_communication boolean NOT NULL DEFAULT false,
  consent_privacy            boolean NOT NULL DEFAULT false,

  -- Attribution (captured silently, never shown publicly)
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  referrer_url text,

  -- Review workflow (admin-only, never returned to the public)
  application_status text NOT NULL DEFAULT 'new',
  internal_notes     text,
  reviewed_at        timestamptz,
  reviewed_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  invite_sent_at     timestamptz,

  CONSTRAINT faa_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT faa_email_shape CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT faa_status_valid CHECK (
    application_status IN
      ('new','reviewing','shortlisted','invited','onboarded','declined','waitlisted')
  ),
  CONSTRAINT faa_device_valid CHECK (device_platform IN ('ios','android')),
  CONSTRAINT faa_artist_type_valid CHECK (
    artist_type IN ('solo','traveling','studio_artist','studio_owner')
  )
);

-- Dedup: one application per email and per instagram handle. Unique indexes on
-- the already-normalised columns so the 23505 the server action catches is
-- predictable. (instagram_handle is stored lowercased; index it directly.)
CREATE UNIQUE INDEX IF NOT EXISTS faa_email_uidx
  ON founding_artist_applications (email);
CREATE UNIQUE INDEX IF NOT EXISTS faa_instagram_uidx
  ON founding_artist_applications (instagram_handle);

-- Admin queue ordering + status filter.
CREATE INDEX IF NOT EXISTS faa_created_idx
  ON founding_artist_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS faa_status_idx
  ON founding_artist_applications (application_status);

ALTER TABLE founding_artist_applications ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: public inserts and admin reads/updates both go
-- through the service-role client, which bypasses RLS.
