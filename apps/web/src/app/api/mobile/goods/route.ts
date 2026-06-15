import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeProductInput } from "@/lib/mobile-goods";
import { revalidatePublicPage } from "@/lib/server/mobile-goods-server";
import { toPriceNumber } from "@/lib/goods";
import type {
  MobileProduct,
  MobileProductsResponse,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/goods — the artist's products (showcase order). image_url is the
// hero thumbnail; full multi-image editing stays web.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, title, category, price_amount, currency, status, is_public_visible, image_url, image_urls",
    )
    .eq("artist_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return mobileError(500, error.message);

  const items: MobileProduct[] = (data ?? []).map((r) => {
    // image_urls is the canonical multi-image source post-migration 0038; fall
    // back to the single image_url for rows that haven't been re-saved yet.
    const urls =
      Array.isArray(r.image_urls) && r.image_urls.length > 0
        ? (r.image_urls as string[])
        : r.image_url
          ? [r.image_url as string]
          : [];
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      price: toPriceNumber(r.price_amount),
      currency: r.currency,
      status: r.status,
      isPublicVisible: r.is_public_visible,
      imageUrl: urls[0] ?? null,
      imageCount: urls.length,
    };
  });
  const body: MobileProductsResponse = { items };
  return mobileOk(body);
}

// POST /api/mobile/goods — create a product (metadata only). Images + variants
// are added on the web; is_checkout_addon / fulfillment default at the DB.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const parsed = normalizeProductInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", userId);

  const { data, error } = await supabase
    .from("products")
    .insert({
      artist_id: userId,
      title: v.title,
      description: v.description,
      category: v.category,
      price_amount: v.price,
      currency: v.currency,
      status: v.status,
      pickup_note: v.pickupNote,
      quantity: v.quantity,
      is_public_visible: v.isPublicVisible,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();
  if (error) return mobileError(500, error.message);

  await revalidatePublicPage(supabase, userId);
  return mobileOk({ id: data.id });
}
