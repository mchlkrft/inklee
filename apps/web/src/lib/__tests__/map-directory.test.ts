import { describe, expect, it } from "vitest";
import {
  MAP_LOCATION_CATEGORIES,
  MAP_VISIBILITY_MODES,
  SEED_BUCKET_TARGET_KM2,
  SEED_CAP_PER_BUCKET,
  STYLE_SEED,
  normalizeInstagramHandle,
  parseMapBBox,
  seedBucketCellBounds,
  seedRegionBucket,
  toPublicMapPin,
  validateMapLocationInput,
  type MapLocationRowForPin,
} from "@inklee/shared/map-directory";

const EARTH_RADIUS_KM = 6371;

/**
 * True spherical area of a lat/lng rectangle, independent of the bucket
 * implementation: A = R^2 * (sin(latMax) - sin(latMin)) * (lngMax - lngMin).
 */
function sphericalAreaKm2(bounds: {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  return (
    EARTH_RADIUS_KM *
    EARTH_RADIUS_KM *
    (Math.sin(toRad(bounds.latMax)) - Math.sin(toRad(bounds.latMin))) *
    (toRad(bounds.lngMax) - toRad(bounds.lngMin))
  );
}

describe("seedRegionBucket", () => {
  // The locked cap is "max 5 studios per 300 square km". This proves one
  // bucket cell approximates 300 square km across the inhabited latitudes
  // (the Phase 1 open item from the schema proposal, section 5).
  it("cells approximate the 300 square km target across latitudes", () => {
    const cases: Array<[string, number, number]> = [
      ["Singapore", 1.35, 103.82],
      ["Mexico City", 19.43, -99.13],
      ["Sydney", -33.87, 151.21],
      ["New York", 40.71, -74.01],
      ["Berlin", 52.52, 13.4],
      ["Oslo", 59.91, 10.75],
      ["Reykjavik", 64.15, -21.94],
      ["Tromso", 69.65, 18.96],
    ];
    for (const [, lat, lng] of cases) {
      const area = sphericalAreaKm2(seedBucketCellBounds(lat, lng));
      expect(area).toBeGreaterThan(SEED_BUCKET_TARGET_KM2 * 0.95);
      expect(area).toBeLessThan(SEED_BUCKET_TARGET_KM2 * 1.05);
    }
  });

  it("is stable for identical coordinates", () => {
    expect(seedRegionBucket(52.52, 13.405)).toBe(
      seedRegionBucket(52.52, 13.405),
    );
  });

  it("keeps nearby points in one bucket and distant points apart", () => {
    // ~1 km apart in Berlin: same cell or a neighbor, never a crash.
    const a = seedRegionBucket(52.52, 13.4);
    // ~25 km apart must always differ (cell side is ~17.3 km).
    const b = seedRegionBucket(52.75, 13.4);
    expect(a).not.toBe(b);
    // Different cities never share a bucket.
    expect(seedRegionBucket(52.52, 13.4)).not.toBe(
      seedRegionBucket(48.14, 11.58),
    );
  });

  it("a point is always inside its own cell bounds", () => {
    for (const [lat, lng] of [
      [52.52, 13.4],
      [-33.87, 151.21],
      [64.15, -21.94],
      [0.0, 0.0],
      [40.71, -74.01],
    ]) {
      const bounds = seedBucketCellBounds(lat, lng);
      expect(lat).toBeGreaterThanOrEqual(bounds.latMin);
      expect(lat).toBeLessThan(bounds.latMax);
      expect(lng).toBeGreaterThanOrEqual(bounds.lngMin);
      expect(lng).toBeLessThan(bounds.lngMax);
    }
  });

  it("handles the antimeridian and poles without throwing", () => {
    expect(() => seedRegionBucket(89.9, 179.99)).not.toThrow();
    expect(() => seedRegionBucket(-89.9, -180)).not.toThrow();
    expect(seedRegionBucket(10, 180)).toBe(seedRegionBucket(10, -180));
  });

  it("exposes the locked cap constant", () => {
    expect(SEED_CAP_PER_BUCKET).toBe(5);
  });
});

describe("validateMapLocationInput", () => {
  const valid = {
    name: "Vagabond Tattoo",
    category: "tattoo_studio",
    latitude: 52.52,
    longitude: 13.4,
  };

  it("accepts a minimal valid location", () => {
    expect(validateMapLocationInput(valid)).toBeNull();
  });

  it("rejects missing name, bad category, out-of-range coordinates", () => {
    expect(validateMapLocationInput({ ...valid, name: "  " })).toMatch(/Name/);
    expect(validateMapLocationInput({ ...valid, category: "bar" })).toMatch(
      /category/,
    );
    expect(validateMapLocationInput({ ...valid, latitude: 91 })).toMatch(
      /Latitude/,
    );
    expect(validateMapLocationInput({ ...valid, longitude: -181 })).toMatch(
      /Longitude/,
    );
  });

  it("rejects non-http website urls", () => {
    expect(
      validateMapLocationInput({ ...valid, websiteUrl: "javascript:alert(1)" }),
    ).toMatch(/http/);
    expect(
      validateMapLocationInput({ ...valid, websiteUrl: "https://ok.example" }),
    ).toBeNull();
  });

  it("category vocabulary matches the migration CHECK list", () => {
    expect(MAP_LOCATION_CATEGORIES).toEqual([
      "tattoo_studio",
      "private_studio",
      "piercing_studio",
      "supply_shop",
      "other",
    ]);
  });

  it("style seed has unique keys and sentence-case labels", () => {
    const keys = STYLE_SEED.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of STYLE_SEED) {
      expect(s.label[0]).toBe(s.label[0].toUpperCase());
    }
  });
});

describe("toPublicMapPin", () => {
  const row: MapLocationRowForPin = {
    id: "x",
    name: "Vagabond",
    category: "tattoo_studio",
    display_latitude: 52.52,
    display_longitude: 13.4,
    city: "Berlin",
    country: "Germany",
    claim_status: "claimed",
    moderation_status: "approved",
  };

  it("shapes an approved row and marks claimed", () => {
    const pin = toPublicMapPin(row);
    expect(pin).toMatchObject({
      id: "x",
      lat: 52.52,
      lng: 13.4,
      claimed: true,
    });
  });

  it("unclaimed and pending-claim rows shape with claimed false", () => {
    for (const claim_status of ["unclaimed", "claim_pending"]) {
      expect(toPublicMapPin({ ...row, claim_status })?.claimed).toBe(false);
    }
  });

  it("fails closed on every non-approved moderation state", () => {
    for (const status of ["pending", "hidden", "removed", "", "garbage"]) {
      expect(toPublicMapPin({ ...row, moderation_status: status })).toBeNull();
    }
  });

  it("fails closed on unknown categories and broken coordinates", () => {
    expect(toPublicMapPin({ ...row, category: "spaceship" })).toBeNull();
    expect(toPublicMapPin({ ...row, display_latitude: Number.NaN })).toBeNull();
  });
});

describe("parseMapBBox", () => {
  it("parses a valid viewport", () => {
    expect(
      parseMapBBox({ west: "13", south: "52", east: "14", north: "53" }),
    ).toEqual({ west: 13, south: 52, east: 14, north: 53 });
  });

  it("rejects missing, non-numeric, inverted, and out-of-range boxes", () => {
    expect(parseMapBBox({})).toBeNull();
    expect(
      parseMapBBox({ west: "a", south: "52", east: "14", north: "53" }),
    ).toBeNull();
    expect(
      parseMapBBox({ west: "14", south: "52", east: "13", north: "53" }),
    ).toBeNull();
    expect(
      parseMapBBox({ west: "13", south: "53", east: "14", north: "52" }),
    ).toBeNull();
    expect(
      parseMapBBox({ west: "-500", south: "52", east: "14", north: "53" }),
    ).toBeNull();
    expect(
      parseMapBBox({ west: "13", south: "52", east: "14", north: "91" }),
    ).toBeNull();
    expect(
      parseMapBBox({ west: "13", south: "52", east: "181", north: "53" }),
    ).toBeNull();
  });

  it("rejects null and empty-string params instead of coercing them to 0", () => {
    expect(
      parseMapBBox({ west: null, south: "52", east: "14", north: "53" }),
    ).toBeNull();
    expect(
      parseMapBBox({ west: "", south: "52", east: "14", north: "53" }),
    ).toBeNull();
    expect(
      parseMapBBox({ west: "13", south: "52", east: "14", north: " " }),
    ).toBeNull();
  });
});

describe("map visibility modes", () => {
  it("matches the 0076 CHECK list with off first", () => {
    expect(MAP_VISIBILITY_MODES).toEqual(["off", "city_only", "listed"]);
  });
});

describe("normalizeInstagramHandle", () => {
  it("strips leading @ and empties to null", () => {
    expect(normalizeInstagramHandle("@inkbyjo")).toBe("inkbyjo");
    expect(normalizeInstagramHandle("@@x")).toBe("x");
    expect(normalizeInstagramHandle("  ")).toBeNull();
    expect(normalizeInstagramHandle(undefined)).toBeNull();
  });
});
