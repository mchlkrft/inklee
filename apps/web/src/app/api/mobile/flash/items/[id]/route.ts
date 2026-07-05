import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeFlashItemUpdate } from "@/lib/mobile-flash";
import {
  computeFlashAvailability,
  formatFlashAvailabilityLabel,
  FLASH_ACTIVE_REQUEST_STATUSES,
} from "@/lib/flash";
import type { MobileFlashItemDetail } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/flash/items/:id — the full editable item + the artist's
// upcoming/active flash days (for the day picker).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;

  const { data: item, error } = await supabase
    .from("flash_items")
    .select("*")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (error) return mobileError(500, error.message);
  if (!item) return mobileError(404, "Flash design not found.", "not_found");

  // Stats sidebar shows confirmed (approved) and pending separately; the
  // availability GATE counts every intake-consuming status (pending too), so a
  // unique design reads as booked while a request is still in review.
  const [{ data: confirmed }, { data: pending }, { count: activeCount }] =
    await Promise.all([
      supabase
        .from("booking_requests")
        .select("id")
        .eq("flash_item_id", id)
        .eq("status", "approved"),
      supabase
        .from("booking_requests")
        .select("id")
        .eq("flash_item_id", id)
        .eq("status", "pending"),
      supabase
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("flash_item_id", id)
        .in("status", [...FLASH_ACTIVE_REQUEST_STATUSES]),
    ]);
  const confirmedCount = confirmed?.length ?? 0;
  const pendingCount = pending?.length ?? 0;
  const av = computeFlashAvailability(
    {
      id: item.id,
      title: item.title,
      slug: item.slug,
      status: item.status,
      booking_mode: item.booking_mode,
      max_bookings: item.max_bookings,
      is_bookable: item.is_bookable,
      available_from: item.available_from,
      available_until: item.available_until,
    },
    activeCount ?? 0,
  );

  // Day membership comes from the flash_day_items junction (source of truth).
  const { data: memberships } = await supabase
    .from("flash_day_items")
    .select("day_id")
    .eq("item_id", id)
    .eq("artist_id", userId);
  const dayMemberships = ((memberships ?? []) as Array<{ day_id: string }>).map(
    (m) => m.day_id,
  );

  const body: MobileFlashItemDetail = {
    id: item.id,
    title: item.title,
    slug: item.slug,
    status: item.status,
    priceType: item.price_type,
    price: item.price != null ? Number(item.price) : null,
    currency: item.currency ?? "eur",
    shortDescription: item.short_description,
    sizeInfo: item.size_info,
    placementNotes: item.placement_notes,
    bookingMode: item.booking_mode,
    maxBookings: item.max_bookings,
    isBookable: item.is_bookable,
    availableFrom: item.available_from,
    availableUntil: item.available_until,
    folderId: item.folder_id,
    dayMemberships,
    previewImageUrl: item.preview_image_url,
    instagramPostUrl: item.instagram_post_url,
    pendingCount,
    confirmedCount,
    bookable: av.bookable,
    availabilityLabel: formatFlashAvailabilityLabel(av),
    remaining: av.remaining ?? null,
  };
  return mobileOk(body);
}

// PUT /api/mobile/flash/items/:id — edit metadata/status/availability. The slug,
// preview image, and Instagram URL are preserved (set on web). Day membership is
// handled by the flash_day_items junction endpoint; this PUT validates folder
// ownership only.
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

  const parsed = normalizeFlashItemUpdate(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const v = parsed.value;

  const { data: existing, error: readErr } = await supabase
    .from("flash_items")
    .select("id")
    .eq("id", id)
    .eq("artist_id", userId)
    .maybeSingle();
  if (readErr) return mobileError(500, readErr.message);
  if (!existing)
    return mobileError(404, "Flash design not found.", "not_found");

  if (v.folderId) {
    const { data: folder, error: folderErr } = await supabase
      .from("flash_folders")
      .select("id")
      .eq("id", v.folderId)
      .eq("artist_id", userId)
      .maybeSingle();
    if (folderErr) return mobileError(500, folderErr.message);
    if (!folder)
      return mobileError(400, "That folder doesn't exist.", "bad_folder");
  }

  // Tri-state fields (slug / preview image URL / Instagram URL) are written only
  // when the client sent them, so a metadata-only save never overwrites a
  // freshly-uploaded image or the slug.
  const patch: Record<string, unknown> = {
    title: v.title,
    status: v.status,
    price_type: v.priceType,
    price: v.price,
    currency: v.currency,
    short_description: v.shortDescription,
    size_info: v.sizeInfo,
    placement_notes: v.placementNotes,
    booking_mode: v.bookingMode,
    max_bookings: v.maxBookings,
    is_bookable: v.isBookable,
    available_from: v.availableFrom,
    available_until: v.availableUntil,
    folder_id: v.folderId,
  };
  if (v.slug !== undefined) patch.slug = v.slug;
  if (v.previewImageUrl !== undefined)
    patch.preview_image_url = v.previewImageUrl;
  if (v.instagramPostUrl !== undefined)
    patch.instagram_post_url = v.instagramPostUrl;

  const { error } = await supabase
    .from("flash_items")
    .update(patch)
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) {
    // UNIQUE(artist_id, slug) violation -> a friendly conflict, not a 500.
    if (error.code === "23505" || /unique/i.test(error.message)) {
      return mobileError(
        409,
        "That public link is already used by another design.",
        "slug_taken",
      );
    }
    return mobileError(500, error.message);
  }

  return mobileOk({ ok: true });
}
