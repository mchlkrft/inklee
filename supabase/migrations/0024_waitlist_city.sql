-- Add city/location field to waitlist entries for demand tracking
ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS city_text text
    CHECK (char_length(city_text) <= 100);
