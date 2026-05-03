import { createClient } from "@/lib/supabase/server";
import TripManager from "./trip-manager";
import StudioList from "./studio-list";
import FeatureIntroModal from "@/components/feature-intro-modal";

export default async function TravelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: rawTrips }, { data: studios }] = await Promise.all([
    supabase
      .from("trips")
      .select(
        "id, title, description, show_on_booking_form, trip_legs(id, starts_on, ends_on, notes, studios(id, name))",
      )
      .eq("artist_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("studios")
      .select(
        "id, name, city, country, address, google_place_id, formatted_address, latitude, longitude, google_maps_url, visibility_mode, public_note, is_primary",
      )
      .eq("artist_id", user!.id)
      .order("name", { ascending: true }),
  ]);

  const trips = (rawTrips ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    showOnBookingForm: t.show_on_booking_form,
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
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Trip Planner
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Plan guest spots and travel dates. Toggle visibility to control
            which trips appear on your public booking form.
          </p>
        </div>
        <FeatureIntroModal featureKey="travel" isEmpty={trips.length === 0} />
      </div>

      <TripManager trips={trips} studios={tripStudioList} />

      <StudioList studios={studioList} />
    </div>
  );
}
