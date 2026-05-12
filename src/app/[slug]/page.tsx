import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import BookingForm from "./booking-form";
import BooksClosedBlock from "./books-closed-block";
import StudioBlock from "./studio-block";
import WaitlistForm from "./waitlist-form";
import { formatSlotDisplay } from "@/lib/timezone";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { parseFormSettings, buildDefaultFieldOrder } from "@/lib/form-settings";
import { parseBooksSettings } from "@/lib/books-settings";
import { serviceClient } from "@/lib/supabase/service";
import {
  formatDateKey,
  isDateKeyBefore,
  todayInTimeZone,
} from "@/lib/date-utils";
import { clampDescription } from "@/lib/seo";

export type SlotOption = {
  id: string;
  date: string;
  time: string;
  tz: string;
};

const FALLBACK_METADATA: Metadata = {
  title: "Tattoo Booking · Inklee",
  description:
    "Send a tattoo booking request through Inklee with your idea, references, placement, size, and preferred date.",
};

// Brand-color name → hex map for cover_color in profile.settings.
// Artists can also pass a raw hex like "#0b3d9f".
const BRAND_COLOR_HEX: Record<string, string> = {
  mustard: "#e9b22b",
  rosa: "#db88b9",
  cobalt: "#0b3d9f",
  red: "#cf2e2c",
  green: "#105f2d",
  charcoal: "#1e1e1e",
  bone: "#e5e1d5",
};

function resolveCoverColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v in BRAND_COLOR_HEX) return BRAND_COLOR_HEX[v];
  if (/^#[0-9a-f]{3,8}$/.test(v)) return v;
  return null;
}

function resolveCoverImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  // Permit only https://, http:// (local dev), and protocol-relative URLs.
  // No data: or javascript: URIs.
  if (
    !v.startsWith("https://") &&
    !v.startsWith("http://") &&
    !v.startsWith("//")
  ) {
    return null;
  }
  return v;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("display_name, location")
    .eq("slug", slug)
    .single();

  if (!profile?.display_name) return FALLBACK_METADATA;

  const name = profile.display_name as string;
  const location = (profile.location as string | null)?.trim() || null;
  const locationPhrase = location ? ` in ${location}` : "";

  const description = clampDescription(
    `Book a tattoo with ${name}${locationPhrase}. Send your idea, references, placement, size, and preferred date.`,
  );
  const ogDescription = clampDescription(
    `Send ${name} your tattoo idea, references, placement, size, and preferred date through Inklee.`,
  );

  return {
    title: `${name} — Tattoo Booking · Inklee`,
    description,
    openGraph: {
      title: `Book a tattoo with ${name}`,
      description: ogDescription,
      type: "profile",
    },
    twitter: {
      card: "summary",
      title: `Book a tattoo with ${name}`,
      description: ogDescription,
    },
  };
}

export default async function ArtistPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select(
      "id, display_name, bio, logo_url, instagram_handle, location, booking_mode, timezone, settings",
    )
    .eq("slug", slug)
    .single();

  if (!profile) notFound();

  const isSlotMode = profile.booking_mode === "fixed_slots";
  let slots: SlotOption[] = [];
  let customFields: CustomFieldDef[] = [];
  const profileSettings = (profile.settings ?? {}) as Record<string, unknown>;
  const formSettings = parseFormSettings(profileSettings.form_settings);

  const coverImage = resolveCoverImage(profileSettings.cover_image_url);
  const coverColor = resolveCoverColor(profileSettings.cover_color);

  const { data: rawCustomFields } = await serviceClient
    .from("custom_fields")
    .select("*")
    .eq("artist_id", profile.id)
    .eq("active", true)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  customFields = (rawCustomFields as CustomFieldDef[]) ?? [];

  const fieldOrder: string[] = Array.isArray(profileSettings.field_order)
    ? (profileSettings.field_order as string[])
    : buildDefaultFieldOrder(customFields.map((f) => f.id));

  if (isSlotMode) {
    const { data: rawSlots } = await serviceClient
      .from("slots")
      .select("id, starts_at, duration_minutes")
      .eq("artist_id", profile.id)
      .eq("status", "open")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true });

    slots = (rawSlots ?? []).map((s) => {
      const d = formatSlotDisplay(
        s.starts_at,
        s.duration_minutes,
        profile.timezone,
      );
      return { id: s.id, date: d.date, time: d.time, tz: d.tz };
    });
  }

  const todayStr = todayInTimeZone(profile.timezone ?? "Europe/Berlin");

  // Fetch all visible trips with their legs
  const { data: rawTrips } = await serviceClient
    .from("trips")
    .select(
      "id, title, description, show_on_booking_form, trip_legs(id, starts_on, ends_on, studio_id, studios(name))",
    )
    .eq("artist_id", profile.id)
    .eq("show_on_booking_form", true);

  type RawLeg = {
    id: string;
    starts_on: string;
    ends_on: string;
    studio_id: string | null;
    studios: { name: string } | { name: string }[] | null;
  };
  type RawTrip = {
    id: string;
    title: string;
    description: string | null;
    show_on_booking_form: boolean;
    trip_legs: RawLeg[];
  };

  const visibleTrips = (rawTrips as unknown as RawTrip[]) ?? [];

  // Active trip: a trip that has at least one leg spanning today
  const activeTrip =
    visibleTrips.find((t) =>
      t.trip_legs.some((l) => l.starts_on <= todayStr && l.ends_on >= todayStr),
    ) ?? null;

  const activeLeg = activeTrip
    ? (activeTrip.trip_legs.find(
        (l) => l.starts_on <= todayStr && l.ends_on >= todayStr,
      ) ?? null)
    : null;

  const activeLegData =
    activeLeg && activeTrip
      ? {
          tripTitle: activeTrip.title,
          startsOn: activeLeg.starts_on,
          endsOn: activeLeg.ends_on,
          studioName: Array.isArray(activeLeg.studios)
            ? (activeLeg.studios[0]?.name ?? null)
            : ((activeLeg.studios as { name: string } | null)?.name ?? null),
          description: activeTrip.description,
        }
      : null;

  // Future trips for the booking form selector — include leg date ranges so the
  // client can filter locations by the chosen preferred date.
  const futureTrips = visibleTrips
    .filter((t) => t.trip_legs.some((l) => l.ends_on >= todayStr))
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      // Include only legs that haven't fully ended yet
      legs: t.trip_legs
        .filter((l) => l.ends_on >= todayStr)
        .map((l) => ({ startsOn: l.starts_on, endsOn: l.ends_on })),
    }));

  // Load primary public studio (never call Google API — read from saved data)
  const { data: primaryStudio } = await serviceClient
    .from("studios")
    .select(
      "id, name, city, country, formatted_address, address, google_maps_url, visibility_mode, public_note",
    )
    .eq("artist_id", profile.id)
    .eq("is_primary", true)
    .neq("visibility_mode", "hidden")
    .maybeSingle();

  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    isDateKeyBefore(
      booksSettings.booking_window_ends_at,
      todayInTimeZone(profile.timezone ?? "Europe/Berlin"),
    );

  const isManuallyClosed = !booksSettings.books_open || windowExpired;
  const isSlotsClosed = isSlotMode && slots.length === 0;

  let isCapReached = false;
  if (
    booksSettings.booking_cap !== null &&
    !isManuallyClosed &&
    !isSlotsClosed
  ) {
    const { count } = await serviceClient
      .from("booking_requests")
      .select("*", { count: "exact", head: true })
      .eq("artist_id", profile.id)
      .in("status", ["pending", "approved", "deposit_pending"]);
    isCapReached = (count ?? 0) >= booksSettings.booking_cap;
  }

  const isClosed = isManuallyClosed || isSlotsClosed || isCapReached;

  const closedMessage = isCapReached
    ? "This round of bookings is full."
    : (booksSettings.books_closed_message ?? "Books are currently closed.");
  const closedHint = isCapReached ? undefined : "Check back soon.";

  // Header style: image > color > default charcoal
  const headerStyle: React.CSSProperties = coverImage
    ? {
        backgroundImage: `url(${coverImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : coverColor
      ? { backgroundColor: coverColor }
      : {};

  return (
    <div className="flex min-h-screen flex-col bg-brand-charcoal text-brand-bone">
      <header className="relative px-6 pt-14 pb-20" style={headerStyle}>
        {coverImage && (
          <div aria-hidden className="absolute inset-0 bg-brand-charcoal/55" />
        )}
        <div className="relative z-10 mx-auto flex max-w-lg flex-col items-center space-y-3 text-center">
          {profile.logo_url && (
            <div className="relative h-28 w-28 overflow-hidden rounded-full ring-2 ring-brand-bone/25">
              <Image
                src={profile.logo_url}
                alt={profile.display_name}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-brand-bone">
              {profile.display_name}
            </h1>
            {(profile.location || profile.instagram_handle) && (
              <div className="flex items-center justify-center gap-2 text-sm text-brand-bone/65">
                {profile.location && <span>{profile.location}</span>}
                {profile.location && profile.instagram_handle && (
                  <span aria-hidden>·</span>
                )}
                {profile.instagram_handle && (
                  <a
                    href={`https://instagram.com/${profile.instagram_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-brand-bone"
                  >
                    @{profile.instagram_handle}
                  </a>
                )}
              </div>
            )}
          </div>
          {profile.bio && (
            <p className="max-w-sm text-sm leading-relaxed text-brand-bone/70">
              {profile.bio}
            </p>
          )}
        </div>
      </header>

      <main
        data-appearance="light"
        className="relative -mt-8 flex-1 rounded-t-[28px] bg-[color:var(--color-workspace-bg)] px-6 pt-10 pb-12 text-foreground md:px-8"
      >
        <div className="mx-auto w-full max-w-lg space-y-8">
          <StudioBlock studio={primaryStudio ?? null} />

          {activeLegData && (
            <div className="space-y-1 rounded-[20px] border border-border px-5 py-4">
              <p className="text-sm font-medium text-foreground">
                {activeLegData.tripTitle}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateKey(activeLegData.startsOn, {
                  day: "numeric",
                  month: "short",
                })}
                {" — "}
                {formatDateKey(activeLegData.endsOn, {
                  day: "numeric",
                  month: "short",
                })}
                {activeLegData.studioName
                  ? ` · ${activeLegData.studioName}`
                  : ""}
              </p>
              {activeLegData.description && (
                <p className="text-xs text-muted-foreground">
                  {activeLegData.description}
                </p>
              )}
            </div>
          )}

          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Booking request
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Fill in the details and I&apos;ll get back to you.
              </p>
            </div>

            {isClosed ? (
              <BooksClosedBlock message={closedMessage} hint={closedHint}>
                <WaitlistForm artistSlug={slug} />
              </BooksClosedBlock>
            ) : (
              <BookingForm
                artistSlug={slug}
                artistFirstName={profile.display_name.split(" ")[0]}
                bookingMode={profile.booking_mode ?? "preferred_date"}
                slots={slots}
                customFields={customFields}
                formSettings={formSettings}
                fieldOrder={fieldOrder}
                trips={futureTrips}
                isDemoAccount={slug === "bert-grimm"}
                studioId={primaryStudio?.id ?? null}
              />
            )}
          </div>
        </div>
      </main>

      <footer className="flex flex-wrap justify-center gap-x-4 gap-y-2 bg-brand-charcoal px-6 py-6 text-xs text-brand-bone/40">
        <Link href="/terms" className="transition-colors hover:text-brand-bone">
          Terms
        </Link>
        <Link
          href="/privacy"
          className="transition-colors hover:text-brand-bone"
        >
          Privacy
        </Link>
        <Link
          href="/imprint"
          className="transition-colors hover:text-brand-bone"
        >
          Imprint
        </Link>
        <span aria-hidden>·</span>
        <Link href="/" className="transition-colors hover:text-brand-bone">
          Powered by inklee
        </Link>
      </footer>
    </div>
  );
}
