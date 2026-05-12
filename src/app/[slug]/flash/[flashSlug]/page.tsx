import { serviceClient } from "@/lib/supabase/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  computeFlashAvailability,
  formatFlashAvailabilityLabel,
  formatPrice,
} from "@/lib/flash";
import FlashBookingForm from "./flash-booking-form";

export default async function PublicFlashItemPage({
  params,
}: {
  params: Promise<{ slug: string; flashSlug: string }>;
}) {
  const { slug, flashSlug } = await params;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id, display_name")
    .eq("slug", slug)
    .single();

  if (!profile) notFound();

  const { data: item } = await serviceClient
    .from("flash_items")
    .select("*")
    .eq("slug", flashSlug)
    .eq("artist_id", profile.id)
    .single();

  if (!item || item.status !== "published") notFound();

  // Count active requests to compute intake availability.
  const { count: activeRequestCount } = await serviceClient
    .from("booking_requests")
    .select("*", { count: "exact", head: true })
    .eq("flash_item_id", item.id)
    .in("status", ["pending", "approved", "deposit_pending"]);

  const availability = computeFlashAvailability(item, activeRequestCount ?? 0);

  // Fetch flash day details if linked
  let flashDay: {
    id: string;
    title: string;
    scheduled_on: string | null;
    location: string | null;
  } | null = null;
  if (item.flash_day_id) {
    const { data: day } = await serviceClient
      .from("flash_days")
      .select("id, title, scheduled_on, location")
      .eq("id", item.flash_day_id)
      .single();
    flashDay = day;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 space-y-8 px-6 py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href={`/${slug}/flash`}
            className="hover:text-foreground transition-colors"
          >
            Flash
          </Link>
          <span>/</span>
          <span className="text-foreground">{item.title}</span>
        </div>

        {/* Flash item detail */}
        <div className="space-y-5">
          {item.preview_image_url && (
            <div className="w-full max-h-80 overflow-hidden rounded-md border border-border bg-muted">
              <Image
                src={item.preview_image_url}
                alt={item.title}
                width={960}
                height={960}
                sizes="(min-width: 1024px) 640px, 100vw"
                className="w-full h-full object-contain"
              />
            </div>
          )}

          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">
              {item.title}
            </h1>

            {item.short_description && (
              <p className="text-base text-muted-foreground leading-relaxed">
                {item.short_description}
              </p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{formatPrice(item.price_type, item.price)}</span>
              {item.size_info && <span>{item.size_info}</span>}
              {item.placement_notes && <span>{item.placement_notes}</span>}
            </div>

            {/* Availability status */}
            <div
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                availability.bookable
                  ? "text-green-500"
                  : "text-muted-foreground"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  availability.bookable ? "bg-green-500" : "bg-muted-foreground"
                }`}
              />
              {formatFlashAvailabilityLabel(availability)}
            </div>

            {/* Flash day context */}
            {flashDay && (
              <div className="rounded-md border border-border px-4 py-3 text-sm space-y-0.5">
                <p className="font-medium text-foreground">{flashDay.title}</p>
                <p className="text-muted-foreground">
                  {flashDay.scheduled_on ?? "Date TBC"}
                  {flashDay.location ? ` · ${flashDay.location}` : ""}
                </p>
              </div>
            )}

            {/* Instagram post link */}
            {item.instagram_post_url && (
              <a
                href={item.instagram_post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
              >
                View on Instagram ↗
              </a>
            )}
          </div>
        </div>

        {/* Booking form or unavailable message */}
        {availability.bookable ? (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">
              Request this design
            </h2>
            <FlashBookingForm
              artistSlug={slug}
              artistFirstName={profile.display_name.split(" ")[0]}
              flashItemId={item.id}
              flashDayId={item.flash_day_id}
              placementHint={item.placement_notes}
            />
          </div>
        ) : (
          <div className="rounded-md border border-border px-5 py-8 text-center space-y-3">
            <p className="text-base font-medium text-foreground">
              {formatFlashAvailabilityLabel(availability)}
            </p>
            <p className="text-sm text-muted-foreground">
              This design is no longer available for booking.
            </p>
            <Link
              href={`/${slug}/flash`}
              className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
            >
              See other available designs
            </Link>
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
