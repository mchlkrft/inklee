// Bio Page module (Slice 72) — the Shop section placeholder. This is the
// architectural slot for artist Goods on the public page. Slice 73 wires real
// product cards (`products` query in page.tsx); until then the page passes an
// empty array and this renders null, so no empty "Shop" heading appears
// publicly and no goods are promised that don't exist yet.
//
// Public product CTAs (Slice 73) must not promise standalone checkout — the v1
// purchase path is Appointment Add-ons after a booking is approved. Safe CTA
// wording: "Available for appointment pickup" / "Add when confirming your
// booking" (see docs/bio-page-goods-plan.md).

// Minimal shape so page.tsx can type the (currently empty) products prop.
// Slice 73 replaces this with the real product/order types.
export type BioShopProduct = {
  id: string;
  title: string;
};

export default function ShopBlock({
  products,
}: {
  products: BioShopProduct[];
}) {
  if (products.length === 0) return null; // real cards arrive in Slice 73

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Shop</h2>
      <p className="text-xs text-muted-foreground">
        Available for pickup at your appointment.
      </p>
      {/* Slice 73: product cards render here. */}
    </section>
  );
}
