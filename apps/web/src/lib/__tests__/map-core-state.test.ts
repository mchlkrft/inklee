import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP_URL_STATE,
  DEFAULT_MAP_VIEWPORT,
  MAP_FILTER_KINDS,
  PUBLIC_MAP_CAPABILITIES,
  artistMapCapabilities,
  decodeMapUrlState,
  encodeMapUrlState,
  filterCategory,
  isMapFilterKind,
  type MapUrlState,
} from "@inklee/shared/map-core-state";

describe("map filter vocabulary", () => {
  it("includes all, every category, watched and signals", () => {
    expect(MAP_FILTER_KINDS).toContain("all");
    expect(MAP_FILTER_KINDS).toContain("tattoo_studio");
    expect(MAP_FILTER_KINDS).toContain("watched");
    expect(MAP_FILTER_KINDS).toContain("signals");
  });

  it("narrows filterCategory to real categories only", () => {
    expect(filterCategory("tattoo_studio")).toBe("tattoo_studio");
    expect(filterCategory("all")).toBeNull();
    expect(filterCategory("watched")).toBeNull();
    expect(filterCategory("signals")).toBeNull();
  });

  it("guards unknown filter kinds", () => {
    expect(isMapFilterKind("tattoo_studio")).toBe(true);
    expect(isMapFilterKind("nonsense")).toBe(false);
  });
});

describe("map capabilities (the permission boundary contract)", () => {
  it("locks down the public plane", () => {
    expect(PUBLIC_MAP_CAPABILITIES.isPublic).toBe(true);
    expect(PUBLIC_MAP_CAPABILITIES.canWatch).toBe(false);
    expect(PUBLIC_MAP_CAPABILITIES.canSeePersonalOverlays).toBe(false);
    expect(PUBLIC_MAP_CAPABILITIES.canSeeNamedArtists).toBe(false);
    expect(PUBLIC_MAP_CAPABILITIES.viewerId).toBeNull();
  });

  it("grants a signed-in artist the personal plane", () => {
    const caps = artistMapCapabilities("artist-123");
    expect(caps.isPublic).toBe(false);
    expect(caps.canWatch).toBe(true);
    expect(caps.canSeePersonalOverlays).toBe(true);
    expect(caps.viewerId).toBe("artist-123");
  });
});

describe("map URL codec", () => {
  it("round-trips a full state", () => {
    const state: MapUrlState = {
      viewport: { lng: 2.3522, lat: 48.8566, zoom: 12.5 },
      filter: "tattoo_studio",
      selectedId: "loc-abc",
    };
    const decoded = decodeMapUrlState(encodeMapUrlState(state));
    expect(decoded.viewport.lat).toBeCloseTo(48.8566, 4);
    expect(decoded.viewport.lng).toBeCloseTo(2.3522, 4);
    expect(decoded.viewport.zoom).toBeCloseTo(12.5, 2);
    expect(decoded.filter).toBe("tattoo_studio");
    expect(decoded.selectedId).toBe("loc-abc");
  });

  it("omits the default filter and an absent selection from the URL", () => {
    const qs = encodeMapUrlState({
      viewport: DEFAULT_MAP_VIEWPORT,
      filter: "all",
      selectedId: null,
    });
    expect(qs).not.toContain("f=");
    expect(qs).not.toContain("sel=");
    expect(qs).toContain("ll=");
    expect(qs).toContain("z=");
  });

  it("decodes an empty string to defaults", () => {
    expect(decodeMapUrlState("")).toEqual(DEFAULT_MAP_URL_STATE);
  });

  it("tolerates a leading question mark", () => {
    const decoded = decodeMapUrlState("?ll=40,10&z=6");
    expect(decoded.viewport.lat).toBe(40);
    expect(decoded.viewport.lng).toBe(10);
    expect(decoded.viewport.zoom).toBe(6);
  });

  it("falls back to defaults on malformed coordinates", () => {
    const decoded = decodeMapUrlState("ll=not,anumber&z=abc");
    expect(decoded.viewport).toEqual(DEFAULT_MAP_VIEWPORT);
  });

  it("rejects out-of-range coordinates but keeps a valid zoom", () => {
    const decoded = decodeMapUrlState("ll=200,999&z=8");
    expect(decoded.viewport.lat).toBe(DEFAULT_MAP_VIEWPORT.lat);
    expect(decoded.viewport.lng).toBe(DEFAULT_MAP_VIEWPORT.lng);
    expect(decoded.viewport.zoom).toBe(8);
  });

  it("clamps zoom into [0, 22]", () => {
    expect(decodeMapUrlState("z=99").viewport.zoom).toBe(22);
    expect(decodeMapUrlState("z=-5").viewport.zoom).toBe(0);
  });

  it("normalizes an unknown filter to all", () => {
    expect(decodeMapUrlState("f=purple").filter).toBe("all");
    expect(decodeMapUrlState("f=watched").filter).toBe("watched");
  });

  it("drops an over-long selected id", () => {
    const longId = "x".repeat(80);
    expect(decodeMapUrlState(`sel=${longId}`).selectedId).toBeNull();
    expect(decodeMapUrlState("sel=loc-1").selectedId).toBe("loc-1");
  });

  it("never encodes personal state (only ll/z/f/sel keys)", () => {
    const qs = encodeMapUrlState({
      viewport: { lng: 1, lat: 2, zoom: 3 },
      filter: "watched",
      selectedId: "loc-9",
    });
    const keys = [...new URLSearchParams(qs).keys()].sort();
    expect(keys).toEqual(["f", "ll", "sel", "z"]);
  });
});
