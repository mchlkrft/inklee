import { createClient } from "@/lib/supabase/server";
import {
  toPriceNumber,
  isProductStatus,
  type ProductStatus,
} from "@/lib/goods";
import { isGoodsCommerceEnabled, shopCheckoutEnabled } from "@/lib/features";
import { parseBioPageSettings } from "@/lib/bio-page-settings";
import { deriveConnectRouting } from "@/lib/stripe-connect";
import { deriveGoodsVisibilitySummary } from "@/lib/goods-visibility-summary";
import {
  parseSurfaceContentSettings,
  resolveSurfaceContent,
} from "@inklee/shared/surface-content";
import { liveCollections } from "@inklee/shared/collections";
import { listCollectionsForArtist } from "@/lib/server/collections";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { richContentBlocksAllowed } from "@/lib/server/entitlement-gates";
import GoodsNewButton from "./goods-new-button";
import GoodsTile, { type GoodsTileItem } from "./goods-tile";
import ShopCheckoutToggle from "./shop-checkout-toggle";
import GoodsVisibilitySummaryCard from "./goods-visibility-summary-card";
import ShopContentForm from "./shop-content-form";

type RawRow = {
  id: string;
  title: string;
  image_url: string | null;
  image_urls: string[] | null;
  price_amount: string | number;
  currency: string | null;
  status: string;
  is_public_visible: boolean;
};

export default async function GoodsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "settings, stripe_account_id, stripe_account_status, stripe_charges_enabled",
    )
    .eq("id", user!.id)
    .single();

  const { data: raw } = await supabase
    .from("products")
    .select(
      "id, title, image_url, image_urls, price_amount, currency, status, is_public_visible",
    )
    .eq("artist_id", user!.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const products: GoodsTileItem[] = ((raw ?? []) as unknown as RawRow[]).map(
    (p) => {
      const imageUrls =
        Array.isArray(p.image_urls) && p.image_urls.length > 0
          ? p.image_urls
          : p.image_url
            ? [p.image_url]
            : [];
      return {
        id: p.id,
        title: p.title,
        price: toPriceNumber(p.price_amount),
        currency: typeof p.currency === "string" ? p.currency : "eur",
        imageUrl: imageUrls[0] ?? null,
        imageCount: imageUrls.length,
        status: (isProductStatus(p.status)
          ? p.status
          : "active") as ProductStatus,
        isPublicVisible: p.is_public_visible,
      };
    },
  );

  // FD7 (founder ruling, 2026-08-01): a per-surface visibility summary,
  // derived once here from the same settings + Connect state every
  // individual toggle on this page already reads.
  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const bioPage = parseBioPageSettings(settings.bio_page);
  const connectRouting = deriveConnectRouting({
    stripe_account_id: profile?.stripe_account_id ?? null,
    stripe_account_status: profile?.stripe_account_status ?? null,
    stripe_charges_enabled: profile?.stripe_charges_enabled ?? null,
  });
  const visibilitySummary = deriveGoodsVisibilitySummary({
    settings,
    bioPage,
    blocks: bioPage.blocks,
    goodsCommerceEnabled: isGoodsCommerceEnabled(),
    connectReady: connectRouting.routeCharges,
  });

  // Shop surface content (founder ruling FD10, 2026-08-01). The editor reads
  // the PURE, unfiltered parser (not resolvedSurfaceContent's entitlement
  // view): an artist's own stored configuration must still be visible to
  // them here even mid-downgrade, so nothing looks silently erased. `entitled`
  // decides only whether the form is interactive.
  const shopContent = resolveSurfaceContent(
    parseSurfaceContentSettings(settings.surface_content),
    "shop",
  );
  let richContentEntitled = false;
  try {
    richContentEntitled = richContentBlocksAllowed(
      await getAccountOverrides(user!.id),
    );
  } catch {
    richContentEntitled = false;
  }
  const allCollections = await listCollectionsForArtist(supabase, user!.id);
  const featurableCollections = liveCollections(allCollections).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Goods
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Products your clients can pick up at their appointment. Shown on
            your public page and offered as add-ons when a client pays a
            deposit.
          </p>
        </div>
        {products.length > 0 && <GoodsNewButton />}
      </div>

      <GoodsVisibilitySummaryCard summary={visibilitySummary} />

      <ShopCheckoutToggle enabled={shopCheckoutEnabled(settings)} />

      <ShopContentForm
        content={shopContent}
        entitled={richContentEntitled}
        collections={featurableCollections}
      />

      {products.length === 0 ? (
        <div className="space-y-4 rounded-[20px] border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No goods yet. Add your first product to show it on your public page
            and offer it at checkout.
          </p>
          <div className="flex justify-center">
            <GoodsNewButton label="Add your first product" />
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {products.map((p) => (
            // Key on status so an edit (or quick toggle) that changes it on the
            // server remounts the tile with fresh local state.
            <li key={`${p.id}-${p.status}`}>
              <GoodsTile item={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
