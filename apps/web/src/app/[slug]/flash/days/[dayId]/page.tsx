import { serviceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  computeFlashAvailability,
  formatFlashAvailabilityLabel,
  FLASH_ACTIVE_REQUEST_STATUSES,
} from "@/lib/flash";
import { formatDateKey } from "@/lib/date-utils";
import { apexHref, artistHref } from "@/lib/public-url";
import FlashDayGrid, { type FlashDayGridItem } from "./flash-day-grid";

// Public flash-day pages are hidden from search, matching the 2026-06-16
// booking-page noindex decision. follow:true keeps internal links crawlable.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

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
    .eq("account_status", "active")
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

  // Private, cancelled, or non-existent days are indistinguishable to clients;
  // a cancelled day must stop soliciting bookings.
  if (!day || !day.is_public || day.status === "cancelled") notFound();

  // Footer + consent links leave the artist namespace for apex-only routes,
  // so they go through apexHref (absolute app-origin URLs on subdomains).
  const termsHref = await apexHref("/terms");
  const privacyHref = await apexHref("/privacy");
  const homeHref = await apexHref("/");

  const studio = (
    Array.isArray(day.studios) ? day.studios[0] : day.studios
  ) as { name: string; city: string | null } | null;
  const locationLabel = studio
    ? studio.city
      ? `${studio.name} · ${studio.city}`
      : studio.name
    : day.location;

  // Roster comes from the flash_day_items junction (source of truth), ordered by
  // position; published designs only.
  const { data: rosterRows } = await serviceClient
    .from("flash_day_items")
    .select(
      "position, flash_items!item_id(id, title, slug, preview_image_url, short_description, price_type, price, currency, size_info, placement_notes, booking_mode, max_bookings, is_bookable, available_from, available_until, status)",
    )
    .eq("day_id", dayId)
    .eq("artist_id", profile.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  type Embedded = Record<string, unknown>;
  const designs = ((rosterRows ?? []) as Array<{ flash_items: unknown }>)
    .map((r) =>
      Array.isArray(r.flash_items)
        ? (r.flash_items[0] as Embedded | undefined)
        : (r.flash_items as Embedded | null),
    )
    .filter((it): it is Embedded => !!it && it.status === "published");

  // Active request counts for accurate availability labels.
  const itemIds = designs.map((d) => d.id as string);
  const activeMap = new Map<string, number>();
  if (itemIds.length > 0) {
    const { data: activeRequests } = await serviceClient
      .from("booking_requests")
      .select("flash_item_id")
      .in("flash_item_id", itemIds)
      .in("status", [...FLASH_ACTIVE_REQUEST_STATUSES]);
    for (const b of activeRequests ?? []) {
      if (b.flash_item_id)
        activeMap.set(
          b.flash_item_id,
          (activeMap.get(b.flash_item_id) ?? 0) + 1,
        );
    }
  }

  const items: FlashDayGridItem[] = designs.map((d) => {
    const av = computeFlashAvailability(
      {
        id: d.id as string,
        title: d.title as string,
        slug: d.slug as string,
        status: d.status as string,
        booking_mode: d.booking_mode as string,
        max_bookings: (d.max_bookings as number | null) ?? null,
        is_bookable: d.is_bookable as boolean,
        available_from: (d.available_from as string | null) ?? null,
        available_until: (d.available_until as string | null) ?? null,
      },
      activeMap.get(d.id as string) ?? 0,
    );
    return {
      id: d.id as string,
      title: d.title as string,
      slug: d.slug as string,
      previewImageUrl: (d.preview_image_url as string | null) ?? null,
      shortDescription: (d.short_description as string | null) ?? null,
      priceType: d.price_type as string,
      price: (d.price as string | number | null) ?? null,
      currency: (d.currency as string | null) ?? null,
      sizeInfo: (d.size_info as string | null) ?? null,
      placementNotes: (d.placement_notes as string | null) ?? null,
      bookable: av.bookable,
      availabilityLabel: formatFlashAvailabilityLabel(av),
    };
  });

  const dateLabel = day.scheduled_on
    ? formatDateKey(day.scheduled_on, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-6 py-12">
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
            href={await artistHref(slug, "/flash")}
            className="inline-block pt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← All flash designs
          </Link>
        </div>

        {/* Grid */}
        {items.length === 0 ? (
          <div className="rounded-md border border-border px-6 py-12 text-center">
            <p className="text-base text-muted-foreground">
              No designs posted for this day yet.
            </p>
          </div>
        ) : (
          <FlashDayGrid
            items={items}
            artistSlug={slug}
            artistFirstName={profile.display_name.split(" ")[0]}
            dayId={dayId}
            termsHref={termsHref}
            privacyHref={privacyHref}
          />
        )}
      </main>

      <footer className="flex justify-center gap-6 px-6 py-6 text-xs text-muted-foreground">
        <Link
          href={termsHref}
          className="hover:text-foreground transition-colors"
        >
          Terms
        </Link>
        <Link
          href={privacyHref}
          className="hover:text-foreground transition-colors"
        >
          Privacy
        </Link>
        <span>·</span>
        <Link
          href={homeHref}
          className="hover:text-foreground transition-colors"
        >
          Powered by inklee
        </Link>
      </footer>
    </div>
  );
}
