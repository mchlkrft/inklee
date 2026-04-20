import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import BookingForm from "./booking-form";
import BooksClosedBlock from "./books-closed-block";
import WaitlistForm from "./waitlist-form";
import { formatSlotDisplay } from "@/lib/timezone";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { parseFormSettings } from "@/lib/form-settings";
import { parseBooksSettings } from "@/lib/books-settings";
import { serviceClient } from "@/lib/supabase/service";

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

  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const now = new Date();

  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    new Date(booksSettings.booking_window_ends_at) < now;

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
    ? "this round of bookings is full."
    : (booksSettings.books_closed_message ?? "books are currently closed.");
  const closedHint = isCapReached ? undefined : "check back soon.";

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 mx-auto w-full max-w-lg px-6 py-12 space-y-10">
        {/* Artist header */}
        <div className="flex flex-col items-center text-center space-y-3">
          {profile.logo_url && (
            <div className="h-16 w-16 rounded-full overflow-hidden border border-border relative">
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
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                @{profile.instagram_handle}
              </a>
            )}
          </div>
          {profile.bio && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              {profile.bio}
            </p>
          )}
        </div>

        {/* Booking form */}
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-medium text-foreground">
              booking request
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              fill in the details and i&apos;ll get back to you
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
            />
          )}
        </div>
      </main>

      <footer className="px-6 py-6 flex justify-center gap-6 text-xs text-muted-foreground">
        <Link href="/terms" className="hover:text-foreground transition-colors">
          terms
        </Link>
        <Link
          href="/privacy"
          className="hover:text-foreground transition-colors"
        >
          privacy
        </Link>
        <Link
          href="/impressum"
          className="hover:text-foreground transition-colors"
        >
          impressum
        </Link>
        <span>·</span>
        <Link href="/" className="hover:text-foreground transition-colors">
          powered by inklee
        </Link>
      </footer>
    </div>
  );
}
