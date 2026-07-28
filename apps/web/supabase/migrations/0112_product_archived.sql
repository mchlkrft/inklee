-- P0 of the Plus package build (plus-build-plan.md): the `archived` product
-- state.
--
-- Two confirmed rules need it (plus-product-spec.md section 9):
--   1. Product and order records are NEVER deleted because an account
--      downgrades; archived products do not count against the active-product
--      cap (Free 3 / Plus 25).
--   2. The delete path must stop hard-deleting products that orders reference.
--      order_items.product_id is ON DELETE SET NULL (0036), so a hard delete
--      strands paid order rows with a null product; the guard promised in the
--      Slice-75 comment in goods/actions.ts was never added. Code now archives
--      instead when references exist.
--
-- Public surfaces are unaffected by construction: every public read is a
-- positive status allowlist (.in("status", ["active", "sold_out"]) or
-- status = 'active'), so an archived product can never leak.

ALTER TYPE product_status ADD VALUE IF NOT EXISTS 'archived';
