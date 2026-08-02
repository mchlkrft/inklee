import { notFound } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import { isGoodsCommerceEnabled, shopCheckoutEnabled } from "@/lib/features";
import { getConnectRoutingForArtist } from "@/lib/stripe-connect";
import { publicBundlesForArtist } from "@/lib/server/bundles";
import { surfaceAppearance } from "@/lib/server/appearance";
import { resolvedSurfaceContent } from "@/lib/server/surface-content";
import { publicCollectionsForArtist } from "@/lib/server/collections";
import { resolveFeaturedCollections } from "@inklee/shared/collections";
import {
  bundleSavings,
  bundlePurchasable,
  resolveBundleComponent,
} from "@inklee/shared/bundles";
import { productAvailability } from "@inklee/shared/product-availability";
import { readGuestTokenHash } from "@/lib/server/shop-guest-identity";
import { getCartForDisplay } from "@/lib/server/shop-cart";
import { listWishlistedKeysForArtist } from "@/lib/server/shop-wishlist";
import { sellerDataComplete, type SellerData } from "@/lib/server/seller-data";
import { SUPPORT_INBOX_EMAIL } from "@/lib/server/support";
import {
  sellerDisclosureBlock,
  returnRightNotice,
} from "@inklee/shared/consumer-disclosures";
import {
  ShopCheckout,
  type CheckoutProduct,
  type CheckoutBundle,
} from "./shop-checkout";

// Standalone shop checkout (GC1 slice C3): the public, guest-buyer page. Fully
// dark: 404 while GOODS_COMMERCE_ENABLED is off, so the route is invisible
// until the goods-commerce un-park. Self-contained by decision GC5 (the page
// lists the products itself; integrating the booking page's wishlist cart is a
// UX follow-on), noindex like every checkout surface.
export const metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

type AvailabilityRow = {
  status: string;
  available_from: string | null;
  preorder: boolean | null;
  quantity: number | null;
};

// Same clock pattern as computeAddonLines (orders.ts): the instant is
// resolved once, outside the component body, so every availability decision
// on one render agrees and the render itself stays pure.
function makeAvailabilityResolver(nowMs: number = Date.now()) {
  return (p: AvailabilityRow) =>
    productAvailability(
      {
        status: p.status,
        availableFrom: p.available_from,
        preorder: p.preorder === true,
        stockQuantity: p.quantity === null ? null : Number(p.quantity),
      },
      nowMs,
    );
}

export default async function ShopCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isGoodsCommerceEnabled()) notFound();

  const { slug } = await params;
  const { data: artist } = await serviceClient
    .from("profiles")
    .select(
      "id, display_name, settings, seller_trading_name, seller_address, seller_contact",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!artist) notFound();

  // Decision S2: the artist's own standalone-shop toggle. 404, not a message —
  // consistent with the park switch above, this route is invisible when off.
  if (!shopCheckoutEnabled(artist.settings)) notFound();

  // C1.1 counsel prerequisite: "Artists without complete seller data cannot
  // enable the shop." Same 404-invisible posture as the toggle above — this
  // is re-checked on the money path itself (createStandaloneGoodsCheckoutCore),
  // which is the actual authority; this is the page-layer half of the
  // defense-in-depth pair (SHOP-VIS-001 posture).
  const seller: SellerData = {
    tradingName: (artist.seller_trading_name as string | null) ?? null,
    address: (artist.seller_address as string | null) ?? null,
    contact: (artist.seller_contact as string | null) ?? null,
  };
  if (!sellerDataComplete(seller)) notFound();

  const artistName = (artist.display_name as string | null) || "This artist";

  // Inherited theming (decision S6): the "shop" surface, resolved the SAME
  // way [slug]/page.tsx resolves "bookingForm" — an unconfigured artist gets
  // an empty cssVars object (byte-identical render), a Plus artist's accent /
  // font / button-radius choices apply. `data-appearance` is clamped to
  // "light" rather than the resolved theme, same as the booking page's own
  // panel: this page's markup uses the generic app tokens (text-foreground
  // etc.), which have no [data-appearance="dark"] block defined yet. A
  // per-surface appearance EDITOR is out of scope (S1's deferral stands);
  // this only makes the surface INHERIT what the artist already set.
  const appearance = await surfaceAppearance(
    artist.id as string,
    artist.settings,
    "shop",
  );

  // Surface content (founder ruling FD10, 2026-08-01): hero media, an intro
  // line, and featured collections on top of the appearance system above.
  // Fail-safe + entitlement-gated like appearance: an unconfigured or
  // unentitled artist gets the all-default (empty) content, which renders
  // byte-identically to this page before FD10 existed.
  const surfaceContent = await resolvedSurfaceContent(
    artist.id as string,
    artist.settings,
    "shop",
  );

  // Charge-readiness decides whether the form renders at all: a shop that
  // cannot be paid must not collect an email and fail at the last step.
  const routing = await getConnectRoutingForArtist(artist.id as string);
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
  const chargeReady = routing.routeCharges && Boolean(publishableKey);

  // is_public_visible: the artist's hide switch, honoured exactly like the
  // public artist page does (SHOP-VIS-001 — the core re-filters too).
  const { data: rows } = await serviceClient
    .from("products")
    .select(
      "id, title, price_amount, currency, status, quantity, available_from, preorder, image_url, custom_made, product_variants(id, name, price_amount_override, stock_quantity, status, sort_order)",
    )
    .eq("artist_id", artist.id as string)
    .eq("status", "active")
    .eq("is_public_visible", true)
    .order("created_at", { ascending: false });

  // One instant for every availability decision on this render (captured on
  // the first call; the same page render never spans a drop boundary in any
  // way that matters).
  const availabilityOf = makeAvailabilityResolver();

  const products: CheckoutProduct[] = (rows ?? []).map((p) => ({
    id: p.id as string,
    title: (p.title as string) ?? "",
    priceAmount: Number(p.price_amount ?? 0),
    currency: (p.currency as string) ?? "eur",
    imageUrl: (p.image_url as string | null) ?? null,
    soldOut: p.quantity !== null && Number(p.quantity) <= 0,
    // SHOP-DROP-001 display half: an undropped product renders, with its
    // stepper disabled (the money path refuses it via the compositor either
    // way; the page must not offer what the server will reject).
    upcoming: availabilityOf(p as AvailabilityRow).state === "upcoming",
    // C1.2: artist-set Art. 16(c) exemption, rendered at the product.
    customMade: p.custom_made === true,
    variants: (
      (p.product_variants ?? []) as {
        id: string;
        name: string;
        price_amount_override: number | null;
        stock_quantity: number | null;
        status: string;
        sort_order: number;
      }[]
    )
      .filter((v) => v.status === "active")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({
        id: v.id,
        name: v.name,
        priceAmount:
          v.price_amount_override === null
            ? null
            : Number(v.price_amount_override),
        soldOut: v.stock_quantity !== null && Number(v.stock_quantity) <= 0,
      })),
  }));

  // Bundles (GC6, variant-aware per FD6): publicBundlesForArtist is
  // entitlement- and kill-switch-aware (fails flat, so a plan blip never
  // breaks the page). Display rules: savings computed against the VISIBLE
  // components only (a hidden component understates the saving, the safe
  // direction); availability uses the SAME shared `resolveBundleComponent` /
  // `bundlePurchasable` rule the money path runs, via one function instead of
  // a second hand-written copy (the GC7-era duplication this replaces), so the
  // buyer is never offered a bundle the server will refuse. Non-EUR bundles
  // are dropped because the standalone path charges EUR unconditionally.
  const rawBundles = await publicBundlesForArtist(
    serviceClient,
    artist.id as string,
  );
  const productRowById = new Map((rows ?? []).map((p) => [p.id as string, p]));
  const bundles: CheckoutBundle[] = rawBundles
    .filter((b) => b.currency === "eur")
    .map((b) => {
      const components = b.items.map((it) => {
        const p = productRowById.get(it.productId);
        const activeVariants = (
          (p?.product_variants ?? []) as {
            id: string;
            name: string;
            price_amount_override: number | null;
            stock_quantity: number | null;
            status: string;
          }[]
        ).filter((v) => v.status === "active");
        const { productHasActiveVariants, resolved } = resolveBundleComponent(
          it.variantId,
          p
            ? {
                available: availabilityOf(p as AvailabilityRow).purchasable,
                activeVariants: activeVariants.map((v) => ({
                  id: v.id,
                  stock: v.stock_quantity,
                })),
                productStock: p.quantity === null ? null : Number(p.quantity),
              }
            : null,
        );
        const matchedVariant = it.variantId
          ? activeVariants.find((v) => v.id === it.variantId)
          : undefined;
        const priceAmount =
          matchedVariant?.price_amount_override != null
            ? Number(matchedVariant.price_amount_override)
            : Number(p?.price_amount ?? 0);
        return {
          quantity: it.quantity,
          variantId: it.variantId,
          productHasActiveVariants,
          resolved,
          title: p ? ((p.title as string) ?? "") : "",
          priceAmount,
          customMade: p?.custom_made === true,
        };
      });
      const present = components.filter((c) => c.resolved !== null);
      const savings = bundleSavings(
        b.priceAmount,
        present.map((c) => ({
          priceAmount: c.priceAmount,
          quantity: c.quantity,
        })),
      );
      const verdict = bundlePurchasable(
        b,
        components.map((c) => ({
          quantity: c.quantity,
          variantId: c.variantId,
          productHasActiveVariants: c.productHasActiveVariants,
          resolved: c.resolved,
          customMade: c.customMade,
        })),
        1,
      );
      return {
        id: b.id,
        name: b.name,
        priceAmount: b.priceAmount,
        currency: b.currency,
        savingsAmount: savings.isSaving ? savings.savingsAmount : 0,
        componentSummary: present
          .map((c) => `${c.quantity > 1 ? `${c.quantity}x ` : ""}${c.title}`)
          .join(" + "),
        available: verdict.ok,
        // C1.2 / counsel Q2: a bundle is all custom-made or all standard, so
        // this is the one answer all of its components give. `every` mirrors
        // resolveBundleLines exactly, including the direction it fails in:
        // a bundle that somehow mixed would keep the return right rather
        // than lose it, and `available` above is already false for it.
        customMade:
          components.length > 0 && components.every((c) => c.customMade),
      };
    });

  // Featured collections (FD10). Only queried when the artist actually
  // featured something — an unconfigured artist (the common case today,
  // since this is dark-launched at 0 Plus artists) costs this page nothing
  // extra. Counted against the products this render is ACTUALLY showing, so
  // a collection whose members are all sold through or hidden never
  // promotes an empty shelf (resolveFeaturedCollections' own contract).
  let featuredCollections: {
    id: string;
    name: string;
    productCount: number;
  }[] = [];
  if (surfaceContent.featuredCollectionIds.length > 0) {
    const { collections, memberships } = await publicCollectionsForArtist(
      serviceClient,
      artist.id as string,
    );
    const visibleProductIds = new Set(products.map((p) => p.id));
    featuredCollections = resolveFeaturedCollections(
      surfaceContent.featuredCollectionIds,
      collections,
      memberships,
      visibleProductIds,
    );
  }

  // FD5: persisted cart + wishlist state, read-only here (a Server Component
  // render cannot set the guest cookie; a first-time visitor with none yet
  // simply has an empty cart/wishlist — not an error).
  const guestTokenHash = await readGuestTokenHash();
  const initialCart = guestTokenHash
    ? await getCartForDisplay(guestTokenHash, artist.id as string)
    : { cartId: null, lines: [], totalMinor: 0, currency: "eur" };
  const wishlistedKeys = guestTokenHash
    ? [
        ...(await listWishlistedKeysForArtist(
          guestTokenHash,
          artist.id as string,
        )),
      ]
    : [];

  // C1.1/C1.2: the seller disclosure block and the standard return notice are
  // built once here (server-side, where the real seller data and support
  // inbox live) and handed down as plain strings — `seller` above already
  // passed sellerDataComplete, so the non-null assertions below are safe.
  const withdrawalFormHref = `/${slug}/shop/withdrawal-form`;
  const sellerBlock = sellerDisclosureBlock(
    {
      tradingName: seller.tradingName as string,
      address: seller.address as string,
      contact: seller.contact as string,
    },
    { supportEmail: SUPPORT_INBOX_EMAIL },
  );
  const returnNotice = returnRightNotice({
    sellerContact: seller.contact as string,
    supportEmail: SUPPORT_INBOX_EMAIL,
    withdrawalFormHref,
  });

  return (
    <div
      data-appearance="light"
      style={appearance.cssVars as React.CSSProperties}
      className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8"
    >
      {surfaceContent.heroMediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={surfaceContent.heroMediaUrl}
          alt=""
          className="h-40 w-full rounded-[14px] object-cover sm:h-56"
        />
      )}

      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Shop checkout</h1>
        <p className="text-sm text-muted-foreground">
          Buy directly from {artistName}. Pickup and delivery are arranged with
          the artist after your order.
        </p>
        {surfaceContent.introText && (
          <p className="text-sm text-foreground">{surfaceContent.introText}</p>
        )}
      </header>

      {featuredCollections.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {featuredCollections.map((c) => (
            <li
              key={c.id}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground"
            >
              {c.name} ·{" "}
              {c.productCount === 1 ? "1 item" : `${c.productCount} items`}
            </li>
          ))}
        </ul>
      )}

      {!chargeReady ? (
        <p className="rounded-[14px] border border-border px-4 py-6 text-sm text-muted-foreground">
          This shop isn&apos;t taking card orders yet. Check back soon.
        </p>
      ) : products.length === 0 && bundles.length === 0 ? (
        <p className="rounded-[14px] border border-border px-4 py-6 text-sm text-muted-foreground">
          Nothing is for sale right now.
        </p>
      ) : (
        <ShopCheckout
          slug={slug}
          artistName={artistName}
          products={products}
          bundles={bundles}
          stripePublishableKey={publishableKey as string}
          initialCart={initialCart}
          wishlistedKeys={wishlistedKeys}
          sellerDisclosureBlock={sellerBlock}
          returnNotice={returnNotice}
        />
      )}
    </div>
  );
}
