import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeProductInput } from "@/lib/mobile-goods";
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
      "id, title, category, price_amount, currency, status, is_public_visible, image_url",
    )
    .eq("artist_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return mobileError(500, error.message);

  const items: MobileProduct[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    price: toPriceNumber(r.price_amount),
    currency: r.currency,
    status: r.status,
    isPublicVisible: r.is_public_visible,
    imageUrl: r.image_url,
  }));
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

  return mobileOk({ id: data.id });
}
