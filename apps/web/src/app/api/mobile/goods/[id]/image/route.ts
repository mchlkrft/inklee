import { randomUUID } from "crypto";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { readImageFile, processAndUpload } from "@/lib/mobile-image";
import { revalidatePublicPage } from "@/lib/server/mobile-goods-server";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/goods/:id/image (multipart: image) — append a photo to a
// product (800 webp, square). Appends to image_urls (preserving any web-managed
// images) and keeps the first as the hero image_url. Verifies ownership first.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { data: product, error: ownErr } = await supabase
    .from("products")
    .select("id, image_urls, image_url")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (ownErr) return mobileError(500, ownErr.message);
  if (!product) return mobileError(404, "Product not found.", "not_found");

  const current = Array.isArray(product.image_urls)
    ? (product.image_urls as string[])
    : product.image_url
      ? [product.image_url as string]
      : [];

  // Enforce the same per-product image cap as the web editor (variantCount + 1,
  // min 3) BEFORE uploading, so the app can't push past it and leave the web
  // goods form unable to save.
  const { count: variantCount } = await supabase
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);
  const maxImages = (variantCount ?? 0) > 0 ? (variantCount ?? 0) + 1 : 3;
  if (current.length >= maxImages) {
    return mobileError(
      400,
      `You can have at most ${maxImages} image${maxImages === 1 ? "" : "s"} for this product.`,
      "image_limit",
    );
  }

  const r = await readImageFile(req);
  if (!r.ok) return mobileError(r.status, r.error);

  const up = await processAndUpload(r.file, {
    path: `${userId}/goods/${id}/${randomUUID()}.webp`,
    width: 800,
    height: 800,
    fit: "cover",
  });
  if (!up.ok) return mobileError(up.status, up.error);

  // The freshly uploaded photo becomes the hero (prepend), so the picker's
  // preview matches image_url; any web-managed images are kept after it.
  const next = [up.url, ...current];

  const { error } = await supabase
    .from("products")
    .update({
      image_urls: next,
      image_url: next[0],
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  await revalidatePublicPage(supabase, userId);
  const body: MobileImageUpload = { url: up.url };
  return mobileOk(body);
}
