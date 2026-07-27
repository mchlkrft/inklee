import { describe, it, expect, vi } from "vitest";

import { sanitizeReturnPath } from "@/lib/return-path";
import {
  quantizeViewportQuery,
  viewportRequestQuery,
} from "@inklee/shared/map-core-state";

/**
 * Go-live plan S2 gates:
 *
 * 1. The moved /map routes carry their own metadata: the strategy's
 *    `noindex, follow` (the (artist) layout's nofollow no longer applies) and
 *    a self-canonical without viewport params. Route-group moves silently
 *    drop inherited metadata, so this is pinned here.
 * 2. The sign-in walls' return target is open-redirect hardened.
 * 3. The viewport request builder quantizes EXACTLY on the public plane
 *    (cache keys collide) and passes raw bounds through on the authed plane.
 */

// The page modules pull server-only dependencies at import time; metadata is
// a plain export, so the heavy imports are mocked away.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: {} }));
vi.mock("@/lib/server/travel-map", () => ({
  listTravelJourney: vi.fn(),
  hasTravelEntries: vi.fn(),
}));
vi.mock("@/lib/growth/activity", () => ({ touchArtistActivity: vi.fn() }));
vi.mock("@/lib/server/map-location-detail", () => ({
  getMapLocationDetail: vi.fn(),
  getPublicMapLocationDetail: vi.fn(),
}));

import { metadata as mapMetadata } from "@/app/(map)/map/page";
import { generateMetadata as detailGenerateMetadata } from "@/app/(map)/map/[id]/page";

describe("moved /map route metadata (noindex, FOLLOW + self-canonicals)", () => {
  it("/map declares noindex,follow and the bare self-canonical", () => {
    expect(mapMetadata.robots).toEqual({ index: false, follow: true });
    expect(mapMetadata.alternates?.canonical).toBe("/map");
  });

  it("/map/[id] declares noindex,follow and its own canonical", async () => {
    const meta = await detailGenerateMetadata({
      params: Promise.resolve({ id: "loc-1" }),
    });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe("/map/loc-1");
  });
});

describe("sanitizeReturnPath (sign-in wall return targets)", () => {
  it("accepts rooted relative paths", () => {
    expect(sanitizeReturnPath("/map")).toBe("/map");
    expect(sanitizeReturnPath("/map?ll=52.5,13.4&z=11&sel=abc")).toBe(
      "/map?ll=52.5,13.4&z=11&sel=abc",
    );
    expect(sanitizeReturnPath("/studio/claim/loc-1")).toBe(
      "/studio/claim/loc-1",
    );
  });

  it("rejects everything that could leave the origin", () => {
    expect(sanitizeReturnPath("https://evil.example")).toBeNull();
    expect(sanitizeReturnPath("//evil.example")).toBeNull();
    expect(sanitizeReturnPath("/\\evil.example")).toBeNull();
    expect(sanitizeReturnPath("javascript:alert(1)")).toBeNull();
    expect(sanitizeReturnPath("map")).toBeNull();
    expect(sanitizeReturnPath("/a b")).toBeNull();
    expect(sanitizeReturnPath("/a\nb")).toBeNull();
    expect(sanitizeReturnPath("")).toBeNull();
    expect(sanitizeReturnPath(null)).toBeNull();
    expect(sanitizeReturnPath(42)).toBeNull();
    expect(sanitizeReturnPath(`/${"a".repeat(600)}`)).toBeNull();
  });
});

describe("viewportRequestQuery (the S2 quantization wiring contract)", () => {
  const bounds = { west: 13.19, south: 52.42, east: 13.62, north: 52.61 };

  it("quantizes on the public plane (byte-equal cache keys)", () => {
    expect(viewportRequestQuery(bounds, 11.73, true)).toEqual(
      quantizeViewportQuery(bounds, 11.73),
    );
  });

  it("passes raw bounds and zoom through on the authed plane", () => {
    expect(viewportRequestQuery(bounds, 11.73, false)).toEqual({
      ...bounds,
      zoom: 11.73,
    });
  });
});
