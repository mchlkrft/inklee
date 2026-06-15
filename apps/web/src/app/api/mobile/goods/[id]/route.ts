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
import type {
  MobileProductDetail,
  MobileProductVariant,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/goods/:id — the full editable product: metadata, the
// canonical image list and the active variants (the loadProductForEditAction
// projection, so the native editor sees exactly what the web modal sees).
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
      "id, title, description, category, image_url, image_urls, price_amount, currency, status, pickup_note, quantity, is_public_visible",
    )
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (error) return mobileError(500, error.message);
  if (!data) return mobileError(404, "Product not found.", "not_found");

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
    .select("id")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (readErr) return mobileError(500, readErr.message);
  if (!existing) return mobileError(404, "Product not found.", "not_found");

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
  const allImageUrls: string[] = Array.isArray(imageRow?.image_urls)
    ? (imageRow!.image_urls as string[])
    : [];
  if (
    imageRow?.image_url &&
    !allImageUrls.includes(imageRow.image_url as string)
  ) {
    allImageUrls.push(imageRow.image_url as string);
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
