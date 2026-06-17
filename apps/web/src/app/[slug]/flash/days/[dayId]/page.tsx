import { serviceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  computeFlashAvailability,
  formatFlashAvailabilityLabel,
  formatPrice,
  FLASH_ACTIVE_REQUEST_STATUSES,
} from "@/lib/flash";
import { formatDateKey } from "@/lib/date-utils";

export default async function PublicFlashDayPage({
  params,
}: {
  params: Promise<{ slug: string; dayId: string }>;
}) {
  const { slug, dayId } = await params;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, display_name")
    .eq("slug", slug)
    .single();

  if (!profile) notFound();

  const { data: day } = await serviceClient
    .from("flash_days")
    .select(
      "id, title, scheduled_on, location, description, status, is_public, studios:studio_id(name, city)",
    )
    .eq("id", dayId)
    .eq("artist_id", profile.id)
    .single();

  // Private or non-existent days are indistinguishable to clients
  if (!day || !day.is_public) notFound();

  const studio = (
    Array.isArray(day.studios) ? day.studios[0] : day.studios
  ) as { name: string; city: string | null } | null;
  const locationLabel = studio
    ? studio.city
      ? `${studio.name} · ${studio.city}`
      : studio.name
    : day.location;

  const { data: items } = await serviceClient
    .from("flash_items")
    .select(
      "id, title, slug, preview_image_url, short_description, price_type, price, size_info, booking_mode, max_bookings, is_bookable, available_from, available_until, status",
    )
    .eq("artist_id", profile.id)
    .eq("flash_day_id", dayId)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  // Active request counts for accurate availability labels.
  const itemIds = (items ?? []).map((i) => i.id);
  const activeRequestMap = new Map<string, number>();
  if (itemIds.length > 0) {
    const { data: activeRequests } = await serviceClient
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

  const dateLabel = day.scheduled_on
    ? formatDateKey(day.scheduled_on, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 space-y-10 px-6 py-12">
        {/* Header */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {profile.display_name} · Flash day
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {day.title}
          </h1>
          {(dateLabel || locationLabel) && (
            <p className="text-sm text-muted-foreground">
              {dateLabel}
              {dateLabel && locationLabel ? " · " : ""}
              {locationLabel}
            </p>
          )}
          {day.description && (
            <p className="pt-2 text-sm leading-relaxed text-muted-foreground">
              {day.description}
            </p>
          )}
          <Link
            href={`/${slug}/flash`}
            className="inline-block pt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← All flash designs
          </Link>
        </div>

        {/* Items */}
        {!items || items.length === 0 ? (
          <div className="rounded-md border border-border px-6 py-12 text-center">
            <p className="text-base text-muted-foreground">
              No designs posted for this day yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const av = computeFlashAvailability(
                item,
                activeRequestMap.get(item.id) ?? 0,
              );
              const disabled = !av.bookable;
              const card = (
                <div
                  className={`flex gap-4 rounded-md border border-border p-4 transition-colors hover:border-foreground/40 ${
                    disabled ? "opacity-60" : ""
                  }`}
                >
                  {item.preview_image_url && (
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                      <Image
                        src={item.preview_image_url}
                        alt={item.title}
                        width={80}
                        height={80}
                        sizes="80px"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {item.title}
                    </p>
                    {item.short_description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {item.short_description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{formatPrice(item.price_type, item.price)}</span>
                      {item.size_info && <span>{item.size_info}</span>}
                      <span
                        className={
                          av.bookable
                            ? "text-green-500"
                            : "text-muted-foreground"
                        }
                      >
                        {formatFlashAvailabilityLabel(av)}
                      </span>
                    </div>
                  </div>
                  {!disabled && (
                    <div className="flex items-center shrink-0">
                      <span className="text-sm text-muted-foreground">→</span>
                    </div>
                  )}
                </div>
              );

              return disabled ? (
                <div key={item.id} className="pointer-events-none">
                  {card}
                </div>
              ) : (
                <Link key={item.id} href={`/${slug}/flash/${item.slug}`}>
                  {card}
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <footer className="flex justify-center gap-6 px-6 py-6 text-xs text-muted-foreground">
        <Link href="/terms" className="hover:text-foreground transition-colors">
          Terms
        </Link>
        <Link
          href="/privacy"
          className="hover:text-foreground transition-colors"
        >
          Privacy
        </Link>
        <span>·</span>
        <Link href="/" className="hover:text-foreground transition-colors">
          Powered by inklee
        </Link>
      </footer>
    </div>
  );
}
