import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import FlashItemForm from "../flash-item-form";
import FlashItemActions from "./flash-item-actions";
import {
  computeFlashAvailability,
  formatFlashAvailabilityLabel,
  formatPrice,
  FLASH_ACTIVE_REQUEST_STATUSES,
} from "@/lib/flash";
import { publicArtistUrl } from "@/lib/public-url";

export default async function FlashItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: item }, { data: profile }] = await Promise.all([
    supabase
      .from("flash_items")
      .select("*")
      .eq("id", id)
      .eq("artist_id", user!.id)
      .single(),
    supabase.from("profiles").select("slug").eq("id", user!.id).single(),
  ]);

  if (!item) notFound();

  // Availability GATE counts every intake-consuming status (pending too, so a
  // unique design reads as booked while a request is in review); the sidebar
  // shows confirmed (approved) and pending separately.
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
  const av = computeFlashAvailability(item, activeCount ?? 0);
  const publicUrl =
    item.status === "published" && profile?.slug
      ? publicArtistUrl(profile.slug, {
          subpath: `/flash/${item.slug}`,
        })
      : null;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/flash/items"
          className="hover:text-foreground transition-colors"
        >
          Flash Items
        </Link>
        <span>/</span>
        <span className="text-foreground">{item.title}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Edit form */}
        <div className="lg:col-span-2">
          <FlashItemForm
            initial={{
              id: item.id,
              title: item.title,
              slug: item.slug,
              status: item.status,
              instagramPostUrl: item.instagram_post_url,
              previewImageUrl: item.preview_image_url,
              shortDescription: item.short_description,
              priceType: item.price_type,
              price: item.price,
              sizeInfo: item.size_info,
              placementNotes: item.placement_notes,
              bookingMode: item.booking_mode,
              maxBookings: item.max_bookings,
              isBookable: item.is_bookable,
              availableFrom: item.available_from,
              availableUntil: item.available_until,
            }}
          />
        </div>

        {/* Sidebar: stats + actions */}
        <div className="space-y-5">
          {/* Stats */}
          <div className="rounded-md border border-border divide-y divide-border text-sm">
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">Availability</span>
              <span
                className={
                  av.bookable ? "text-green-500" : "text-muted-foreground"
                }
              >
                {formatFlashAvailabilityLabel(av)}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">Pending</span>
              <span className="text-foreground">{pendingCount}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">Confirmed</span>
              <span className="text-foreground">{confirmedCount}</span>
            </div>
            {item.booking_mode === "limited" && item.max_bookings && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-muted-foreground">Capacity</span>
                <span className="text-foreground">
                  {confirmedCount} / {item.max_bookings}
                </span>
              </div>
            )}
            <div className="flex justify-between px-4 py-3">
              <span className="text-muted-foreground">Price</span>
              <span className="text-foreground">
                {formatPrice(item.price_type, item.price)}
              </span>
            </div>
          </div>

          {/* Public link */}
          {publicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
            >
              View public page ↗
            </a>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              Publish this item to make it publicly visible.
            </p>
          )}

          {/* Actions */}
          <FlashItemActions
            item={{
              id: item.id,
              isBookable: item.is_bookable,
              status: item.status,
            }}
          />

          {/* View bookings link */}
          {confirmedCount + pendingCount > 0 && (
            <Link
              href={`/bookings/overview?view=requests`}
              className="block text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              View related bookings →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
