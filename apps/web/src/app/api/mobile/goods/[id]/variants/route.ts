import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeVariantsInput } from "@/lib/mobile-goods";
import { reconcileVariants } from "@/lib/server/goods-variants";
import { revalidatePublicPage } from "@/lib/server/mobile-goods-server";
import { UUID_RE } from "@/lib/mobile-booking-form";
import { maxProductImages, toPriceNumber } from "@/lib/goods";
import type {
  MobileProductVariant,
  MobileProductVariantsResult,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// PUT /api/mobile/goods/:id/variants — replace the product's option list with
// the whole displayed list, exactly like the web form posts it. Runs the same
// shared reconcile core the web actions use (update kept ids in place, insert
// new rows, soft-archive removed rows historical orders still reference).
// Ownership is verified with an RLS-scoped read before the service-client
// core runs.
export async function PUT(
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const parsed = normalizeVariantsInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);

  const { data: existing, error: readErr } = await supabase
    .from("products")
    .select("id, image_urls, image_url")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (readErr) return mobileError(500, readErr.message);
  if (!existing) return mobileError(404, "Product not found.", "not_found");

  // The web couples images and variants in one save; this route must not let
  // a shrinking option list leave the product over the image cap (the web
  // form would then refuse to save).
  const imageCount = Array.isArray(existing.image_urls)
    ? (existing.image_urls as string[]).length
    : existing.image_url
      ? 1
      : 0;
  const newMax = maxProductImages(parsed.value.length);
  if (imageCount > newMax) {
    const excess = imageCount - newMax;
    return mobileError(
      400,
      `Remove ${excess} ${excess === 1 ? "image" : "images"} first: with ${parsed.value.length} ${parsed.value.length === 1 ? "option" : "options"} you can have at most ${newMax}.`,
    );
  }

  await reconcileVariants(id, parsed.value);
  // Revalidate right after the write — the response-shaping read below must
  // not be able to skip it by failing.
  await revalidatePublicPage(supabase, userId);

  // Return the canonical saved list (RLS read) so the client reseeds with
  // real ids and the next save round-trips them.
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

  const body: MobileProductVariantsResult = { variants };
  return mobileOk(body);
}
