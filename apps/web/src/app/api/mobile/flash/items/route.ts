import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { FLASH_ITEM_STATUSES } from "@/lib/mobile-flash";
import type {
  MobileFlashItem,
  MobileFlashItemsResponse,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/flash/items?status= — the artist's flash designs (newest
// first), optionally filtered by status. RLS scopes to own rows; the eq is
// belt-and-suspenders.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const status = new URL(req.url).searchParams.get("status");

  let query = supabase
    .from("flash_items")
    .select(
      "id, title, status, price_type, price, is_bookable, preview_image_url, booking_mode, flash_day_id",
    )
    .eq("artist_id", userId)
    .order("created_at", { ascending: false });
  if (status && (FLASH_ITEM_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return mobileError(500, error.message);

  const items: MobileFlashItem[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priceType: r.price_type,
    price: r.price != null ? Number(r.price) : null,
    isBookable: r.is_bookable,
    previewImageUrl: r.preview_image_url,
    bookingMode: r.booking_mode,
    flashDayId: r.flash_day_id,
  }));
  const body: MobileFlashItemsResponse = { items };
  return mobileOk(body);
}
