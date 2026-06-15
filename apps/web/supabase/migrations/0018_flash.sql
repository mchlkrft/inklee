-- Flash Days: optional grouping for flash events
CREATE TABLE flash_days (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title        text NOT NULL,
  scheduled_on date,
  location     text,
  description  text,
  status       text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'past', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE flash_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist can manage own flash days"
  ON flash_days FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

-- Flash Items: bookable tattoo design offers
CREATE TABLE flash_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title               text NOT NULL,
  slug                text NOT NULL,
  status              text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  instagram_post_url  text,
  preview_image_url   text,
  short_description   text,
  price_type          text NOT NULL DEFAULT 'request'
    CHECK (price_type IN ('fixed', 'from', 'request')),
  price               numeric(10, 2),
  size_info           text,
  placement_notes     text,
  booking_mode        text NOT NULL DEFAULT 'unique'
    CHECK (booking_mode IN ('unique', 'limited', 'repeatable')),
  max_bookings        integer,
  is_bookable         boolean NOT NULL DEFAULT true,
  available_from      date,
  available_until     date,
  flash_day_id        uuid REFERENCES flash_days(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artist_id, slug)
);

ALTER TABLE flash_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist can manage own flash items"
  ON flash_items FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

-- Public can read published flash items (anon queries always add artist_id filter)
CREATE POLICY "public can read published flash items"
  ON flash_items FOR SELECT
  USING (status = 'published');

-- Link booking_requests to flash items and flash days
ALTER TABLE booking_requests
  ADD COLUMN flash_item_id uuid REFERENCES flash_items(id) ON DELETE SET NULL,
  ADD COLUMN flash_day_id  uuid REFERENCES flash_days(id)  ON DELETE SET NULL;
