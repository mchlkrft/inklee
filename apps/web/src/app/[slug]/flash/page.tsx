import { serviceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  computeFlashAvailability,
  formatFlashAvailabilityLabel,
  formatPrice,
  FLASH_ACTIVE_REQUEST_STATUSES,
} from "@/lib/flash";

// Hidden from search, matching the booking-page noindex decision (2026-06-16).
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function PublicFlashOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, display_name, logo_url, instagram_handle")
    .eq("slug", slug)
    .single();

  if (!profile) notFound();

  const { data: items } = await serviceClient
    .from("flash_items")
    .select(
      "id, title, slug, preview_image_url, short_description, price_type, price, size_info, booking_mode, max_bookings, is_bookable, available_from, available_until, status",
    )
    .eq("artist_id", profile.id)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  // Get active request counts for all items to compute intake availability.
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

  const bookableItems = (items ?? []).filter(
    (i) =>
      computeFlashAvailability(i, activeRequestMap.get(i.id) ?? 0).bookable,
  );
  const unavailableItems = (items ?? []).filter(
    (i) =>
      !computeFlashAvailability(i, activeRequestMap.get(i.id) ?? 0).bookable,
  );

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 space-y-10 px-6 py-12">
        {/* Artist header */}
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">
            {profile.display_name}
          </h1>
          <p className="text-sm text-muted-foreground">Flash designs</p>
          <Link
            href={`/${slug}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to booking page
          </Link>
        </div>

        {bookableItems.length === 0 && unavailableItems.length === 0 ? (
          <div className="rounded-md border border-border px-6 py-12 text-center">
            <p className="text-base text-muted-foreground">
              No flash designs available right now.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {bookableItems.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-foreground">
                  Available
                </h2>
                <div className="space-y-4">
                  {bookableItems.map((item) => {
                    const av = computeFlashAvailability(
                      item,
                      activeRequestMap.get(item.id) ?? 0,
                    );
                    return (
                      <FlashCard
                        key={item.id}
                        item={item}
                        av={av}
                        artistSlug={slug}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {unavailableItems.length > 0 && (
              <section className="space-y-4 opacity-50">
                <h2 className="text-base font-semibold text-foreground">
                  Unavailable
                </h2>
                <div className="space-y-4">
                  {unavailableItems.map((item) => {
                    const av = computeFlashAvailability(
                      item,
                      activeRequestMap.get(item.id) ?? 0,
                    );
                    return (
                      <FlashCard
                        key={item.id}
                        item={item}
                        av={av}
                        artistSlug={slug}
                        disabled
                      />
                    );
                  })}
                </div>
              </section>
            )}
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

function FlashCard({
  item,
  av,
  artistSlug,
  disabled = false,
}: {
  item: {
    id: string;
    title: string;
    slug: string;
    preview_image_url: string | null;
    short_description: string | null;
    price_type: string;
    price: string | null;
    size_info: string | null;
  };
  av: ReturnType<typeof computeFlashAvailability>;
  artistSlug: string;
  disabled?: boolean;
}) {
  const inner = (
    <div className="rounded-md border border-border overflow-hidden flex gap-4 p-4 transition-colors hover:border-foreground/40">
      {item.preview_image_url && (
        <div className="w-20 h-20 shrink-0 rounded-md overflow-hidden bg-muted">
          <Image
            src={item.preview_image_url}
            alt={item.title}
            width={80}
            height={80}
            sizes="80px"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-semibold text-foreground">{item.title}</p>
        {item.short_description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {item.short_description}
          </p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{formatPrice(item.price_type, item.price)}</span>
          {item.size_info && <span>{item.size_info}</span>}
          <span
            className={av.bookable ? "text-green-500" : "text-muted-foreground"}
          >
            {formatFlashAvailabilityLabel(av)}
          </span>
        </div>
      </div>
      {!disabled && (
        <div className="flex items-center shrink-0">
          <span className="text-muted-foreground text-sm">→</span>
        </div>
      )}
    </div>
  );

  if (disabled) return <div className="pointer-events-none">{inner}</div>;

  return <Link href={`/${artistSlug}/flash/${item.slug}`}>{inner}</Link>;
}
