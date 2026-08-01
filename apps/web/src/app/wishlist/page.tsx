import { isGoodsCommerceEnabled } from "@/lib/features";
import { readGuestTokenHash } from "@/lib/server/shop-guest-identity";
import { listWishlist } from "@/lib/server/shop-wishlist";
import { WishlistView } from "./wishlist-view";

// FD5 wishlist page (founder ruling, 2026-08-01): "a wishlist MAY span
// artists" — unlike the per-artist shop/checkout page, this route has no
// [slug] segment at all. Dark behind the same GOODS_COMMERCE_ENABLED park
// switch as the rest of the standalone shop; noindex like every buyer-state
// surface (nothing here is content worth ranking).
export const metadata = {
  title: "Your wishlist",
  robots: { index: false, follow: false },
};

export default async function WishlistPage() {
  if (!isGoodsCommerceEnabled()) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8">
        <p className="text-sm text-muted-foreground">
          Wishlists aren&apos;t available yet.
        </p>
      </div>
    );
  }

  // Read-only: a Server Component render cannot set the guest cookie (Next
  // disallows it outside a Server Function/Route Handler), so a first-time
  // visitor with no cookie yet simply has an empty wishlist — never an error.
  const guestTokenHash = await readGuestTokenHash();
  const items = guestTokenHash ? await listWishlist(guestTokenHash) : [];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Your wishlist</h1>
        <p className="text-sm text-muted-foreground">
          Saved from shops across Inklee. Moving an item to a cart always goes
          to that artist&apos;s own cart.
        </p>
      </header>
      <WishlistView initialItems={items} />
    </div>
  );
}
