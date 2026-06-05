ALTER TABLE booking_images
  ADD COLUMN original_filename TEXT,
  ADD COLUMN mime_type         TEXT NOT NULL DEFAULT 'image/webp',
  ADD COLUMN width             INTEGER,
  ADD COLUMN height            INTEGER,
  ADD COLUMN file_size         INTEGER;
