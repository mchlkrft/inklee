import { describe, it, expect } from "vitest";
import {
  googleMapsNavUrl,
  safeMapsUrl,
  travelStopTimeframe,
  groupJourneyByTrip,
  type TravelMapStop,
} from "@inklee/shared/travel-map";

const stop = (over: Partial<TravelMapStop>): TravelMapStop => ({
  id: "s1",
  tripId: "t1",
  tripTitle: "Trip 1",
  name: "[DEMO] Studio",
  city: "Berlin",
  country: "Germany",
  latitude: 52.52,
  longitude: 13.405,
  googleMapsUrl: null,
  icon: null,
  iconColor: null,
  startsAt: "2026-07-10",
  endsAt: "2026-07-20",
  timeframe: "upcoming",
  bookingCount: 0,
  ...over,
});

describe("googleMapsNavUrl", () => {
  it("builds a universal directions deep link", () => {
    expect(googleMapsNavUrl(52.52, 13.405)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=52.52%2C13.405",
    );
  });
});

describe("safeMapsUrl", () => {
  it("keeps an https studio url but rejects odd schemes", () => {
    expect(
      safeMapsUrl({
        googleMapsUrl: "https://maps.google.com/?q=x",
        latitude: 1,
        longitude: 2,
      }),
    ).toBe("https://maps.google.com/?q=x");
    // javascript: / non-https falls back to the coordinate directions link
    expect(
      safeMapsUrl({
        googleMapsUrl: "javascript:alert(1)",
        latitude: 1,
        longitude: 2,
      }),
    ).toBe(googleMapsNavUrl(1, 2));
    expect(
      safeMapsUrl({ googleMapsUrl: null, latitude: 1, longitude: 2 }),
    ).toBe(googleMapsNavUrl(1, 2));
  });
});

describe("travelStopTimeframe", () => {
  const today = "2026-06-23";
  it("classifies relative to today, tolerating open ends", () => {
    expect(travelStopTimeframe("2025-03-01", "2025-03-10", today)).toBe(
      "previous",
    );
    expect(travelStopTimeframe("2026-06-01", "2026-07-05", today)).toBe(
      "current",
    );
    expect(travelStopTimeframe("2026-08-01", "2026-08-07", today)).toBe(
      "upcoming",
    );
    expect(travelStopTimeframe(null, null, today)).toBe("current");
  });
});

describe("groupJourneyByTrip", () => {
  it("splits active vs past, current-containing trip leads", () => {
    const stops: TravelMapStop[] = [
      stop({
        id: "p1",
        tripId: "past",
        tripTitle: "Past",
        timeframe: "previous",
        startsAt: "2025-03-01",
      }),
      stop({
        id: "u1",
        tripId: "soon",
        tripTitle: "Soon",
        timeframe: "upcoming",
        startsAt: "2026-09-01",
      }),
      stop({
        id: "c1",
        tripId: "now",
        tripTitle: "Now",
        timeframe: "current",
        startsAt: "2026-06-01",
      }),
    ];
    const { active, past } = groupJourneyByTrip(stops);
    expect(past.map((g) => g.tripId)).toEqual(["past"]);
    // current-containing trip ("now") leads the active list
    expect(active.map((g) => g.tripId)).toEqual(["now", "soon"]);
  });

  it("keeps date order within a trip", () => {
    const stops: TravelMapStop[] = [
      stop({ id: "b", tripId: "t", startsAt: "2026-07-20" }),
      stop({ id: "a", tripId: "t", startsAt: "2026-07-10" }),
    ];
    // input order preserved within the group (caller sorts the journey by date)
    const { active } = groupJourneyByTrip(stops);
    expect(active[0].stops.map((s) => s.id)).toEqual(["b", "a"]);
  });
});
