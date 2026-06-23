import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import TripManager from "./trip-manager";
import StudioList from "./studio-list";
import FeatureIntroModal from "@/components/feature-intro-modal";
import { publicArtistUrl } from "@/lib/public-url";

export default async function TravelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", user!.id)
    .single();

  const [{ data: rawTrips }, { data: studios }, { count: waitlistCount }] =
    await Promise.all([
      supabase
        .from("trips")
        .select(
          "id, title, description, show_on_booking_form, icon, icon_color, trip_legs(id, starts_on, ends_on, notes, studios(id, name))",
        )
        .eq("artist_id", user!.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("studios")
        .select(
          "id, name, city, country, address, google_place_id, formatted_address, latitude, longitude, google_maps_url, visibility_mode, public_note, is_primary, icon, icon_color",
        )
        .eq("artist_id", user!.id)
        .order("name", { ascending: true }),
      supabase
        .from("waitlist_entries")
        .select("*", { count: "exact", head: true })
        .eq("artist_id", user!.id)
        .eq("status", "waiting")
        .not("city_text", "is", null),
    ]);

  const trips = (rawTrips ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    showOnBookingForm: t.show_on_booking_form,
    icon: (t.icon as string | null) ?? null,
    iconColor: (t.icon_color as string | null) ?? null,
    legs: (
      (t.trip_legs as unknown as Array<{
        id: string;
        starts_on: string;
        ends_on: string;
        notes: string | null;
        studios: { id: string; name: string } | null;
      }>) ?? []
    )
      .map((l) => ({
        id: l.id,
        startsOn: l.starts_on,
        endsOn: l.ends_on,
        notes: l.notes,
        studio: l.studios,
      }))
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
  }));

  const studioList = (studios ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    city: s.city,
    country: s.country,
    address: s.address,
    google_place_id: s.google_place_id,
    formatted_address: s.formatted_address,
    latitude: s.latitude,
    longitude: s.longitude,
    google_maps_url: s.google_maps_url,
    visibility_mode: s.visibility_mode,
    public_note: s.public_note,
    is_primary: s.is_primary,
    icon: (s.icon as string | null) ?? null,
    iconColor: (s.icon_color as string | null) ?? null,
  }));

  // Trip manager only needs minimal studio info for leg assignment
  const tripStudioList = studioList.map(({ id, name, city, country }) => ({
    id,
    name,
    city,
    country,
  }));

  return (
    <div className="space-y-10 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Guest Spots
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan guest spots and travel dates. Toggle visibility to control
            which trips appear on your public booking form.
          </p>
          {profile?.slug && (
            <a
              href={publicArtistUrl(profile.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Preview public page &rarr;
            </a>
          )}
          {(trips.length > 0 || studioList.length > 0) && (
            <Link
              href="/map"
              className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Show on map &rarr;
            </Link>
          )}
        </div>
        <FeatureIntroModal featureKey="travel" isEmpty={trips.length === 0} />
      </div>

      {(waitlistCount ?? 0) > 0 && (
        <Link
          href="/bookings/overview?view=waitlist"
          className="flex items-center justify-between rounded-md border border-border px-5 py-3 text-sm text-muted-foreground transition-colors hover:bg-[color:var(--color-workspace-hover)] hover:text-foreground"
        >
          <span>See waitlist demand by city to plan your next trip</span>
          <span aria-hidden>&rarr;</span>
        </Link>
      )}

      <TripManager trips={trips} studios={tripStudioList} />

      <section id="studios" className="scroll-mt-24">
        <StudioList studios={studioList} />
      </section>
    </div>
  );
}
