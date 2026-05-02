import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import BookingForm from "./booking-form";
import BooksClosedBlock from "./books-closed-block";
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

export type SlotOption = {
  id: string;
  date: string;
  time: string;
  tz: string;
};

export default async function ArtistPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
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

  const { data: rawCustomFields } = await supabase
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
    const { data: rawSlots } = await supabase
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
  const { data: rawTrips } = await supabase
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

  const formAppearance = booksSettings.form_appearance;

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      data-appearance={formAppearance !== "dark" ? formAppearance : undefined}
    >
      <main className="mx-auto flex-1 w-full max-w-lg space-y-10 px-6 py-12">
        <div className="flex flex-col items-center space-y-3 text-center">
          {profile.logo_url && (
            <div className="relative h-25 w-25 overflow-hidden rounded-full border border-border">
              <Image
                src={profile.logo_url}
                alt={profile.display_name}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div className="space-y-0.5">
            <h1 className="text-lg font-semibold text-foreground">
              {profile.display_name}
            </h1>
            {profile.location && (
              <p className="text-sm text-muted-foreground">
                {profile.location}
              </p>
            )}
            {profile.instagram_handle && (
              <a
                href={`https://instagram.com/${profile.instagram_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                @{profile.instagram_handle}
              </a>
            )}
          </div>
          {profile.bio && (
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {profile.bio}
            </p>
          )}
        </div>

        {activeLegData && (
          <div className="space-y-0.5 rounded-md border border-border px-4 py-3">
            <p className="text-sm text-foreground">{activeLegData.tripTitle}</p>
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
              {activeLegData.studioName ? ` · ${activeLegData.studioName}` : ""}
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
            <h2 className="text-base font-medium text-foreground">
              Booking request
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
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
            />
          )}
        </div>
      </main>

      <footer className="flex justify-center gap-6 px-6 py-6 text-xs text-muted-foreground">
        <Link href="/terms" className="transition-colors hover:text-foreground">
          Terms
        </Link>
        <Link
          href="/privacy"
          className="transition-colors hover:text-foreground"
        >
          Privacy
        </Link>
        <Link
          href="/impressum"
          className="transition-colors hover:text-foreground"
        >
          Impressum
        </Link>
        <span>·</span>
        <Link href="/" className="transition-colors hover:text-foreground">
          Powered by inklee
        </Link>
      </footer>
    </div>
  );
}
