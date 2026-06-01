-- Multi-image goods (Slice 73 extension, 2026-06-01): products.image_url is a
-- single TEXT, but the public shop wants a carousel. Adding products.image_urls
-- text[] as the canonical source; existing single-image rows are backfilled
-- into the new array. products.image_url stays in sync with image_urls[0] for
-- legacy readers and will be dropped in a later migration once nothing reads it.

ALTER TABLE products
  ADD COLUMN image_urls text[] NOT NULL DEFAULT '{}';

UPDATE products
   SET image_urls = ARRAY[image_url]
 WHERE image_url IS NOT NULL
   AND image_url <> '';
