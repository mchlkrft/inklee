import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listTravelJourney, hasTravelEntries } from "@/lib/server/travel-map";
import {
  groupJourneyByTrip,
  type TravelMapStop,
} from "@inklee/shared/travel-map";
import { BRAND, PAST_GREY } from "./map-style";

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

// The map plots the artist's guest-spot travel (trips -> legs -> studios). Only
// available once there is something to show: with no trip or studio the artist
// is sent back to Guest Spots.
export default async function TravelMapPage() {
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
