-- Cached preview image path for synced Instagram posts.
-- Instagram CDN URLs (`media_url`, `thumbnail_url`) expire and are blocked
-- by referrer on third-party origins. We download each post's preview
-- to the `logos` bucket at sync time and render the Supabase URL instead.
-- Path convention: `{artistId}/instagram/{instagramMediaId}.webp`.
-- Nullable: existing rows resolve to null until next Resync; UI falls back
-- to a placeholder for null paths.
ALTER TABLE instagram_posts
  ADD COLUMN preview_image_path text;
