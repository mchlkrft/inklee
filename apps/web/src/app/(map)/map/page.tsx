import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled, publicMapEnabled } from "@/lib/map-features";
import { listTravelJourney, hasTravelEntries } from "@/lib/server/travel-map";
import {
  groupJourneyByTrip,
  type TravelMapStop,
} from "@inklee/shared/travel-map";
import {
  artistMapCapabilities,
  PUBLIC_MAP_CAPABILITIES,
} from "@inklee/shared/map-core-state";
import { BRAND, PAST_GREY } from "./map-style";

// The auth-optional map route (go-live plan S2). /map moved OUT of the
// (artist) group so one URL can serve both planes over the one shared core:
// a signed-in artist gets exactly the pre-S2 experience (immersive shell,
// personal overlays SSR'd below, authed capabilities), an anonymous visitor
// gets the same shell with PUBLIC_MAP_CAPABILITIES while publicMapEnabled()
// is on, and is redirected to /login exactly as before otherwise.
//
// What the (artist) layout used to provide is reintroduced deliberately: the
// robots posture lives here (now the strategy's noindex, FOLLOW, with a
// self-canonical stripped of viewport params), the dark-state auth redirect
// lives below, and the workspace chrome plus the day-grain activity touch
// come from the auth-aware (map) layout via the shared ArtistWorkspaceShell.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
  alternates: { canonical: "/map" },
  title: "Tattoo map",
};

// Discovery mode (Inklee 2.0 Phase 2): the tattoo map of studios and shops.
// The personal plane (journey + watched ids) is SSR'd ONLY on the authed
// branch; the anonymous document never embeds personal data (S2 invariant).
async function DiscoveryMapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { default: ImmersiveMapShell } = await import("./immersive-map-shell");

  if (!user) {
    if (!publicMapEnabled()) redirect("/login");
    // The personal-plane props are OMITTED, not passed empty: anything named
    // here is serialized into the RSC payload inline in the document, so
    // passing `watchedIds={[]}` would put the personal-plane shape in the
    // anonymous HTML even with no data in it. The public document carries no
    // trace of the personal plane at all (e2e-locked).
    return <ImmersiveMapShell capabilities={PUBLIC_MAP_CAPABILITIES} />;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const [journey, { data: watchedData }] = await Promise.all([
    listTravelJourney(supabase, user.id, todayKey),
    supabase
      .from("watched_studios")
      .select("map_location_id")
      .eq("artist_user_id", user.id),
  ]);
  const watchedIds = (watchedData ?? []).map(
    (w) => w.map_location_id as string,
  );

  return (
    <ImmersiveMapShell
      journey={journey}
      watchedIds={watchedIds}
      capabilities={artistMapCapabilities(user.id)}
    />
  );
}

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function fmtRange(s: string | null, e: string | null): string {
  if (s && e) return `${fmtDate(s)} to ${fmtDate(e)}`;
  if (s) return `From ${fmtDate(s)}`;
  if (e) return `Until ${fmtDate(e)}`;
  return "Ongoing";
}

const TIMEFRAME_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  current: "Now",
  previous: "Past",
};

function StopRow({ stop, n }: { stop: TravelMapStop; n: number }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-border p-3">
      <span
        aria-hidden
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-brand-charcoal"
        style={{
          backgroundColor:
            stop.timeframe === "previous" ? PAST_GREY : BRAND.mustard,
        }}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{stop.name}</p>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {TIMEFRAME_LABEL[stop.timeframe]}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {[stop.city, stop.country].filter(Boolean).join(", ")}
          {stop.city || stop.country ? " · " : ""}
          {fmtRange(stop.startsAt, stop.endsAt)}
        </p>
        <p className="text-xs text-muted-foreground">
          {stop.bookingCount} {stop.bookingCount === 1 ? "booking" : "bookings"}{" "}
          during this trip
        </p>
      </div>
    </li>
  );
}

// The classic journey map (pre-2.0 behavior, active while the map flag is
// off). Authed-only, exactly as before, and the (map) layout restores the
// full workspace chrome for signed-in users, so the kill-switch fallback
// renders exactly as it did under the (artist) group.
export default async function TravelMapPage() {
  if (tattooMapEnabled()) return DiscoveryMapPage();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await hasTravelEntries(supabase, user.id))) redirect("/travel");

  const todayKey = new Date().toISOString().slice(0, 10);
  const journey = await listTravelJourney(supabase, user.id, todayKey);
  const numberById = new Map(journey.map((s, i) => [s.id, i + 1]));
  const { active, past } = groupJourneyByTrip(journey);

  const { default: MapClient } = await import("./map-client");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/travel"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Guest Spots
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">Travel map</h1>
        <p className="text-sm text-muted-foreground">
          Your guest spots and trips, plotted in date order: places you have
          already been are greyed, upcoming stops are the mustard route. Zoom in
          to reveal pins and studio names.
        </p>
      </header>

      <MapClient journey={journey} />

      {journey.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a date and a studio with a location to a trip to see it here on
          the map.
        </p>
      ) : (
        <>
          {/* Map key: pin colors. */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Map key
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: BRAND.mustard }}
                />
                Upcoming stop
              </li>
              <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: PAST_GREY }}
                />
                Visited
              </li>
            </ul>
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Your travel
            </h2>
            {active.map((g) => (
              <div key={g.tripId} className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {g.tripTitle}
                </h3>
                <ol className="space-y-2">
                  {g.stops.map((s) => (
                    <StopRow
                      key={s.id}
                      stop={s}
                      n={numberById.get(s.id) ?? 0}
                    />
                  ))}
                </ol>
              </div>
            ))}
            {past.length > 0 ? (
              <details className="rounded-2xl border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
                  Past trips ({past.length})
                </summary>
                <div className="space-y-3 px-3 pb-3">
                  {past.map((g) => (
                    <div key={g.tripId} className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.tripTitle}
                      </h3>
                      <ol className="space-y-2">
                        {g.stops.map((s) => (
                          <StopRow
                            key={s.id}
                            stop={s}
                            n={numberById.get(s.id) ?? 0}
                          />
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
