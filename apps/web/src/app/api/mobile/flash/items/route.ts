import crypto from "crypto";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { FLASH_ITEM_STATUSES } from "@/lib/mobile-flash";
import {
  computeFlashAvailability,
  formatFlashAvailabilityLabel,
  slugify,
  FLASH_ACTIVE_REQUEST_STATUSES,
} from "@/lib/flash";
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

  const params = new URL(req.url).searchParams;
  const status = params.get("status");
  const folder = params.get("folder");

  let query = supabase
    .from("flash_items")
    .select(
      "id, title, slug, status, price_type, price, currency, is_bookable, preview_image_url, booking_mode, max_bookings, available_from, available_until, folder_id",
    )
    .eq("artist_id", userId)
    .order("created_at", { ascending: false });
  if (status && (FLASH_ITEM_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }
  // ?folder=unfiled -> designs with no folder; ?folder=<uuid> -> that folder.
  if (folder === "unfiled") {
    query = query.is("folder_id", null);
  } else if (folder) {
    query = query.eq("folder_id", folder);
  }

  const { data, error } = await query;
  if (error) return mobileError(500, error.message);

  const rows = data ?? [];

  // Active requests reduce intake capacity (unique/limited). Mirror the web
  // items page set: pending + approved + deposit_pending. Only queried when
  // there are rows to score.
  const activeRequestMap = new Map<string, number>();
  if (rows.length > 0) {
    const itemIds = rows.map((r) => r.id);
    const { data: activeRequests } = await supabase
      .from("booking_requests")
      .select("flash_item_id")
      .in("flash_item_id", itemIds)
      .in("status", [...FLASH_ACTIVE_REQUEST_STATUSES]);
    for (const b of activeRequests ?? []) {
      if (b.flash_item_id)
        activeRequestMap.set(
          b.flash_item_id,
          (activeRequestMap.get(b.flash_item_id) ?? 0) + 1,
        );
    }
  }

  const items: MobileFlashItem[] = rows.map((r) => {
    const av = computeFlashAvailability(
      {
        id: r.id,
        title: r.title,
        slug: r.slug,
        status: r.status,
        booking_mode: r.booking_mode,
        max_bookings: r.max_bookings,
        is_bookable: r.is_bookable,
        available_from: r.available_from,
        available_until: r.available_until,
      },
      activeRequestMap.get(r.id) ?? 0,
    );
    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      status: r.status,
      priceType: r.price_type,
      price: r.price != null ? Number(r.price) : null,
      currency: r.currency ?? "eur",
      isBookable: r.is_bookable,
      previewImageUrl: r.preview_image_url,
      bookingMode: r.booking_mode,
      folderId: r.folder_id,
      bookable: av.bookable,
      // Hide the label on the default happy path (published + bookable +
      // unlimited) to keep rows uncluttered, matching the web tile.
      availabilityLabel:
        av.bookable && av.remaining === undefined
          ? null
          : formatFlashAvailabilityLabel(av),
      remaining: av.remaining ?? null,
    };
  });
  const body: MobileFlashItemsResponse = { items };
  return mobileOk(body);
}

// POST /api/mobile/flash/items — one-tap draft create (mirrors the web
// createFlashItemAction quick-create defaults: optional title falling back to
// "Untitled flash", auto slug, draft status, unique booking mode, on-request
// pricing). Returns { id } so the app lands straight on the photo-first edit
// screen, where the image upload (which needs the row id) is available.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: Record<string, unknown> = {};
  try {
    raw = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    // No body is fine — quick-create uses defaults.
  }

  const itemId = crypto.randomUUID();
  const titleInput =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, 200)
      : null;
  const title = titleInput ?? "Untitled flash";
  const slug =
    (titleInput ? slugify(titleInput) : "") || `flash-${itemId.slice(0, 8)}`;

  const { error } = await supabase.from("flash_items").insert({
    id: itemId,
    artist_id: userId,
    title,
    slug,
    status: "draft",
    price_type: "request",
    price: null,
    booking_mode: "unique",
    max_bookings: null,
    is_bookable: true,
  });
  if (error) {
    if (error.message.includes("unique")) {
      return mobileError(409, "A flash item with this slug already exists.");
    }
    return mobileError(500, error.message);
  }

  return mobileOk({ id: itemId });
}
