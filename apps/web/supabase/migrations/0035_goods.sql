-- Goods module (Slice 73): artist products + simple variants, surfaced on the
-- Bio Page shop and (Slice 74+) as Appointment Add-ons.
--
-- RLS follows the post-0030 lock-down convention: artists manage their own rows
-- via auth.uid(); there is NO anon SELECT policy. Public shop reads go through
-- the service-role client, which bypasses RLS. Money is numeric(10,2), converted
-- to cents only at Stripe PaymentIntent time (same as deposits).

-- Enums
CREATE TYPE product_category AS ENUM (
  'print', 'shirt', 'sticker', 'zine', 'flash_sheet', 'original', 'patch', 'other'
);
CREATE TYPE product_status AS ENUM ('active', 'hidden', 'sold_out');
CREATE TYPE product_fulfillment AS ENUM ('appointment_pickup');

-- Products
CREATE TABLE products (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title              text NOT NULL,
  description        text,
  category           product_category NOT NULL DEFAULT 'other',
  image_url          text,
  price_amount       numeric(10, 2) NOT NULL,
  currency           text NOT NULL DEFAULT 'eur',
  status             product_status NOT NULL DEFAULT 'active',
  fulfillment_type   product_fulfillment NOT NULL DEFAULT 'appointment_pickup',
  pickup_note        text,
  is_public_visible  boolean NOT NULL DEFAULT true,
  is_checkout_addon  boolean NOT NULL DEFAULT true,
  quantity           integer,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_artist_id_idx ON products (artist_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist can manage own products"
  ON products FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

-- Product variants (simple: shirt sizes etc. — no option matrix in v1)
CREATE TABLE product_variants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  price_amount_override numeric(10, 2),
  stock_quantity        integer,
  status                product_status NOT NULL DEFAULT 'active',
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_variants_product_id_idx ON product_variants (product_id);

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist can manage own product variants"
  ON product_variants FOR ALL
  USING (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_variants.product_id AND p.artist_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_variants.product_id AND p.artist_id = auth.uid()
  ));
