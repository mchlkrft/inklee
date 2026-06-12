import { randomUUID } from "crypto";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { readImageFile, processAndUpload } from "@/lib/mobile-image";
import {
  ownedGoodsStoragePath,
  revalidatePublicPage,
} from "@/lib/server/mobile-goods-server";
import { serviceClient } from "@/lib/supabase/service";
import { UUID_RE } from "@/lib/mobile-booking-form";
import { maxProductImages } from "@/lib/goods";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/goods/:id/image (multipart: image) — add a photo to a
// product (800 webp, square). Default PREPENDS so the new photo becomes the
// hero (the old single-photo form's preview-matches-hero contract); with
// `?append=1` it appends instead, preserving pick order (the multi-image
// editor's web-parity semantics — web composes keep ++ new). Verifies
// ownership first.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return mobileError(404, "Product not found.", "not_found");
  }
  const append = new URL(req.url).searchParams.get("append") === "1";

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

  // Enforce the same per-product image cap as the web editor (the shared
  // maxProductImages rule) BEFORE uploading, so the app can't push past it
  // and leave the web goods form unable to save. ACTIVE variants only —
  // soft-archived hidden rows would inflate the cap past what every other
  // surface (GET detail, the editors, the web action) enforces.
  const { count: variantCount } = await supabase
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id)
    .eq("status", "active");
  const maxImages = maxProductImages(variantCount ?? 0);
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

  const next = append ? [...current, up.url] : [up.url, ...current];

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

// DELETE /api/mobile/goods/:id/image  { url } — remove one image from the
// product. Ports the removal half of the web's processProductImages: the URL
// must be a member of the product's CURRENT list (so a crafted body cannot
// graft or delete foreign objects), image_url stays synced to the new first
// entry, and the storage object is removed best-effort through the
// artist+product-scoped path guard.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return mobileError(404, "Product not found.", "not_found");
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  if (typeof body.url !== "string" || body.url.length === 0) {
    return mobileError(400, "url is required.");
  }

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
  if (!current.includes(body.url)) {
    return mobileError(404, "Image not found.", "not_found");
  }

  const next = current.filter((u) => u !== body.url);
  const { error } = await supabase
    .from("products")
    .update({
      image_urls: next,
      image_url: next[0] ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  const path = ownedGoodsStoragePath(body.url, userId, id);
  if (path) {
    await serviceClient.storage
      .from("logos")
      .remove([path])
      .catch(() => undefined);
  }

  await revalidatePublicPage(supabase, userId);
  return mobileOk({ ok: true });
}
