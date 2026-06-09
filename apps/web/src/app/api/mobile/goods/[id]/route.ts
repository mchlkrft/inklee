import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeProductInput } from "@/lib/mobile-goods";
import { toPriceNumber } from "@/lib/goods";
import type { MobileProductDetail } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/goods/:id — the full editable product (metadata only).
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
      "id, title, description, category, image_url, price_amount, currency, status, pickup_note, quantity, is_public_visible",
    )
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (error) return mobileError(500, error.message);
  if (!data) return mobileError(404, "Product not found.", "not_found");

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

  return mobileOk({ ok: true });
}

// DELETE /api/mobile/goods/:id — remove a product. Variants cascade via FK.
// NOTE: storage image files are NOT cleaned up here (the web action does that via
// the image-path security helpers); orphaned webp files under the artist's own
// namespace are a known v1 follow-up bundled with the image-upload slice — no
// cross-artist exposure since deletion is artist-scoped.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
