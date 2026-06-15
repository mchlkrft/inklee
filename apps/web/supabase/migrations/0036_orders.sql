-- Orders (Slice 74): one order per booking, capturing the combined deposit +
-- appointment add-ons paid in a single Stripe PaymentIntent. Amounts are
-- numeric(10,2); the webhook is the source of truth for the paid state.
--
-- Orders are written by the service-role client (the customer pays from the
-- magic-link portal with no auth.uid()), so writes bypass RLS. The artist
-- dashboard reads them under RLS keyed to auth.uid(). No anon policy.

CREATE TYPE order_status AS ENUM (
  'pending', 'paid', 'cancelled', 'refunded', 'partially_refunded'
);
CREATE TYPE order_fulfillment_status AS ENUM (
  'pending_pickup', 'picked_up', 'cancelled'
);
CREATE TYPE order_item_type AS ENUM ('deposit', 'product');

CREATE TABLE orders (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id                uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  booking_id               uuid NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  client_email             text,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text, -- forward-compat; unused in v1 (PaymentIntents)
  status                   order_status NOT NULL DEFAULT 'pending',
  deposit_amount           numeric(10, 2) NOT NULL,
  goods_amount             numeric(10, 2) NOT NULL DEFAULT 0,
  subtotal_amount          numeric(10, 2) NOT NULL,
  platform_fee_amount      numeric(10, 2),
  currency                 text NOT NULL DEFAULT 'eur',
  fulfillment_status       order_fulfillment_status NOT NULL DEFAULT 'pending_pickup',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_artist_id_idx ON orders (artist_id);
CREATE INDEX orders_booking_id_idx ON orders (booking_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist can read own orders"
  ON orders FOR ALL
  USING (artist_id = auth.uid())
  WITH CHECK (artist_id = auth.uid());

CREATE TABLE order_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type            order_item_type NOT NULL,
  product_id      uuid REFERENCES products(id) ON DELETE SET NULL,
  variant_id      uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  title_snapshot  text NOT NULL,
  variant_snapshot text,
  quantity        integer NOT NULL DEFAULT 1,
  unit_amount     numeric(10, 2) NOT NULL,
  total_amount    numeric(10, 2) NOT NULL,
  currency        text NOT NULL DEFAULT 'eur'
);

CREATE INDEX order_items_order_id_idx ON order_items (order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist can read own order items"
  ON order_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id AND o.artist_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id AND o.artist_id = auth.uid()
  ));
