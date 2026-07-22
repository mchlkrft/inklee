import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import MapPresenceForm, { type MapPresenceValues } from "./map-presence-form";

export const metadata = { title: "Settings · Map presence" };

export default async function MapPresenceSettingsPage() {
  if (!tattooMapEnabled()) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: styleData }, { data: ownStyles }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "map_visibility, looking_for_guest_spots, map_city_label, map_city_place_id, map_city_lat, map_city_lng, travel_map_consent, passport_public, guest_naming_opt_out",
        )
        .eq("id", user.id)
        .single(),
      serviceClient
        .from("styles")
        .select("key, label")
        .order("position", { ascending: true }),
      supabase
        .from("artist_styles")
        .select("style_key")
        .eq("artist_user_id", user.id),
    ]);
  if (!profile) redirect("/onboarding/welcome");

  const initial: MapPresenceValues = {
    mapVisibility: (profile.map_visibility as string) ?? "off",
    lookingForGuestSpots: Boolean(profile.looking_for_guest_spots),
    cityLabel: (profile.map_city_label as string | null) ?? null,
    cityPlaceId: (profile.map_city_place_id as string | null) ?? null,
    cityLat: (profile.map_city_lat as number | null) ?? null,
    cityLng: (profile.map_city_lng as number | null) ?? null,
    travelMapConsent: Boolean(profile.travel_map_consent),
    passportPublic: Boolean(profile.passport_public),
    guestNamingOptOut: Boolean(profile.guest_naming_opt_out),
    styleKeys: (ownStyles ?? []).map((s) => s.style_key as string),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Map presence</h1>
        <p className="text-sm text-muted-foreground">
          Control how you appear on the tattoo map. Everything here is off by
          default and never shows your exact position, only your city.
        </p>
      </header>
      <MapPresenceForm
        initial={initial}
        styles={(styleData ?? []).map((s) => ({
          key: s.key as string,
          label: s.label as string,
        }))}
        placesApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
      />
    </div>
  );
}
