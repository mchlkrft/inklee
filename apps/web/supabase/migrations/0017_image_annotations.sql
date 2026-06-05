-- Add annotation data column to booking_images.
-- Annotations are stored as a JSONB array of { id, x, y, comment } objects.
-- Nullable — null means no annotations were submitted for this image.
ALTER TABLE booking_images
  ADD COLUMN annotations jsonb;
