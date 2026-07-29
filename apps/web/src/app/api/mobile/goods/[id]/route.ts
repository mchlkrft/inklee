import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsSchedulingAllowed } from "@/lib/server/entitlement-gates";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeProductInput } from "@/lib/mobile-goods";
import {
  revalidatePublicPage,
  sweepGoodsStorage,
} from "@/lib/server/mobile-goods-server";
import { maxProductImages, toPriceNumber } from "@/lib/goods";
import {
  checkProductCap,
  productHasOrderReferences,
} from "@/lib/server/goods-guard";
import type {
  MobileProductDetail,
  MobileProductVariant,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/goods/:id — the full editable product: metadata, the
// canonical image list and the active variants (the loadProductForEditAction
// projection, so the native editor sees exactly what the web modal sees).

/**
 * The scheduling fields to write, or nothing when the artist is not entitled.
 *
 * Mirrors applySchedulingEntitlement in the web action: the values are dropped
 * rather than the save rejected. A plan-read blip drops them too, which is the
 * conservative direction (no drop is set) rather than the destructive one.
 */
async function schedulingPatch(
  artistId: string,
  v: {
    availableFrom?: unknown;
    preorder?: unknown;
    lowStockThreshold?: unknown;
  },
): Promise<Record<string, unknown>> {
  let allowed = false;
  try {
    allowed = goodsSchedulingAllowed(await getAccountOverrides(artistId));
  } catch {
    allowed = false;
  }
  if (!allowed) return {};

  const iso =
    typeof v.availableFrom === "string" && v.availableFrom.trim() !== ""
      ? new Date(v.availableFrom).toISOString()
      : null;
  const threshold =
    typeof v.lowStockThreshold === "number" &&
    Number.isFinite(v.lowStockThreshold) &&
    v.lowStockThreshold >= 0
      ? Math.round(v.lowStockThreshold)
      : null;
  return {
    available_from: Number.isNaN(Date.parse(String(iso))) ? null : iso,
    preorder: v.preorder === true,
    low_stock_threshold: threshold,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, title, description, category, image_url, image_urls, price_amount, currency, status, pickup_note, quantity, is_public_visible, available_from, preorder, low_stock_threshold",
    )
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (error) return mobileError(500, error.message);
  if (!data) return mobileError(404, "Product not found.", "not_found");

  // Server-resolved so the app never re-derives a plan rule (P5c).
  let schedulingEntitled = false;
  try {
    schedulingEntitled = goodsSchedulingAllowed(
      await getAccountOverrides(userId),
    );
  } catch {
    schedulingEntitled = false;
  }

  // Hidden variants are soft-archived rows historical orders still reference;
  // the artist edits the active set (web parity: loadProductForEditAction).
  const { data: rawVariants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, name, price_amount_override, stock_quantity")
    .eq("product_id", id)
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  if (variantsError) return mobileError(500, variantsError.message);

  const variants: MobileProductVariant[] = (rawVariants ?? []).map((v) => ({
    id: v.id as string,
    name: v.name as string,
    priceOverride:
      v.price_amount_override !== null && v.price_amount_override !== undefined
        ? toPriceNumber(v.price_amount_override)
        : null,
    stock: (v.stock_quantity as number | null) ?? null,
  }));

  const imageUrls: string[] = Array.isArray(data.image_urls)
    ? (data.image_urls as string[])
    : data.image_url
      ? [data.image_url as string]
      : [];

  const body: MobileProductDetail = {
    id: data.id,
    title: data.title,
    description: data.description,
    category: data.category,
    price: toPriceNumber(data.price_amount),
    currency: data.currency,
    status: data.status,
    pickupNote: data.pickup_note,
    quantity: data.quantity,
    // Drops, preorders and stock alerts (P5c).
    availableFrom: (data.available_from as string | null) ?? null,
    preorder: data.preorder === true,
    lowStockThreshold: (data.low_stock_threshold as number | null) ?? null,
    schedulingEntitled,
    isPublicVisible: data.is_public_visible,
    imageUrl: data.image_url,
    imageUrls,
    variants,
    maxImages: maxProductImages(variants.length),
  };
  return mobileOk(body);
}

// PUT /api/mobile/goods/:id — edit metadata/status. Images (image_urls/image_url),
// variants, and the checkout-addon flag are NOT written, so web-managed media +
// the parked commerce config are preserved.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const parsed = normalizeProductInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  const { data: existing, error: readErr } = await supabase
    .from("products")
    .select("id, status")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (readErr) return mobileError(500, readErr.message);
  if (!existing) return mobileError(404, "Product not found.", "not_found");

  // Leaving `archived` re-enters the active-product cap (Free 3 / Plus 25).
  if (existing.status === "archived" && v.status !== "archived") {
    const capErr = await checkProductCap(supabase, userId);
    if (capErr) return mobileError(403, capErr, "cap_reached");
  }

  const { error } = await supabase
    .from("products")
    .update({
      title: v.title,
      description: v.description,
      category: v.category,
      price_amount: v.price,
      currency: v.currency,
      status: v.status,
      pickup_note: v.pickupNote,
      quantity: v.quantity,
      // Same gate the web action applies (P5c): an un-entitled artist's values
      // are DROPPED rather than rejected, because the rest of their save is
      // perfectly valid and failing the whole form over a field they cannot
      // use would be worse.
      ...(await schedulingPatch(userId, v)),
      is_public_visible: v.isPublicVisible,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  await revalidatePublicPage(supabase, userId);
  return mobileOk({ ok: true });
}

// DELETE /api/mobile/goods/:id — remove a product. Variants cascade via FK.
// Storage image files are swept via the shared ownedGoodsStoragePath helper
// (artist+product-scoped), mirroring deleteProductAction so a mobile delete no
// longer leaves orphaned webp files. The public page is revalidated too.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  // Snapshot the image URLs first so the storage sweep can include every
  // per-image file plus the legacy single-image path.
  const { data: imageRow } = await supabase
    .from("products")
    .select("image_urls, image_url")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (!imageRow) return mobileError(404, "Product not found.", "not_found");
  const allImageUrls: string[] = Array.isArray(imageRow?.image_urls)
    ? (imageRow!.image_urls as string[])
    : [];
  if (
    imageRow?.image_url &&
    !allImageUrls.includes(imageRow.image_url as string)
  ) {
    allImageUrls.push(imageRow.image_url as string);
  }

  // ORDER GUARD (P0, mirrors deleteProductAction): a product any order line
  // references is ARCHIVED, never deleted, and its images are kept. Response
  // stays additive for installed builds: `ok` keeps its shape, `archived` is a
  // new optional field (wire policy).
  if (await productHasOrderReferences(id)) {
    const { error: archiveErr } = await supabase
      .from("products")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("artist_id", userId);
    if (archiveErr) return mobileError(500, archiveErr.message);
    await revalidatePublicPage(supabase, userId);
    return mobileOk({ ok: true, archived: true });
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  await sweepGoodsStorage(userId, id, allImageUrls);
  await revalidatePublicPage(supabase, userId);
  return mobileOk({ ok: true });
}
