import { describe, it, expect, afterEach } from "vitest";

import { publicMapApiPolicy } from "@/lib/map-features";
import {
  PUBLIC_MAP_CAPABILITIES,
  resolveMapCapabilities,
  quantizeViewportQuery,
} from "@inklee/shared/map-core-state";

/**
 * Go-live plan S1 gates, pinned as unit tests:
 *
 * 1. The /api/map/* branch policy. The fail-closed rollback story depends on
 *    the server side: with NEXT_PUBLIC_PUBLIC_MAP unset, an anonymous request
 *    must be refused exactly as before S1 existed, regardless of anything
 *    else. A signed-in user always gets the authed plane.
 * 2. Capability resolution. A null viewer resolves to PUBLIC_MAP_CAPABILITIES
 *    (every gated field false, no viewer id); a signed-in viewer gets the full
 *    artist plane. These fields are load-bearing in the routes and shells.
 * 3. Cache-key quantization. Public request URLs must be deterministic and
 *    idempotent (equal viewports -> byte-equal URLs -> CDN cache hits), and
 *    the quantized bbox must COVER the requested viewport so rendering stays
 *    correct.
 */

const ORIGINAL_TATTOO_MAP = process.env.NEXT_PUBLIC_TATTOO_MAP;
const ORIGINAL_PUBLIC_MAP = process.env.NEXT_PUBLIC_PUBLIC_MAP;

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  setEnv("NEXT_PUBLIC_TATTOO_MAP", ORIGINAL_TATTOO_MAP);
  setEnv("NEXT_PUBLIC_PUBLIC_MAP", ORIGINAL_PUBLIC_MAP);
});

describe("publicMapApiPolicy (the S1 branch decision)", () => {
  it("signed-in users get the authed plane regardless of the public flag", () => {
    setEnv("NEXT_PUBLIC_TATTOO_MAP", "true");
    setEnv("NEXT_PUBLIC_PUBLIC_MAP", undefined);
    expect(publicMapApiPolicy(true)).toBe("authed");
    setEnv("NEXT_PUBLIC_PUBLIC_MAP", "true");
    expect(publicMapApiPolicy(true)).toBe("authed");
  });

  it("anonymous requests are refused while the public flag is off (rollback story)", () => {
    setEnv("NEXT_PUBLIC_TATTOO_MAP", "true");
    setEnv("NEXT_PUBLIC_PUBLIC_MAP", undefined);
    expect(publicMapApiPolicy(false)).toBe("unauthorized");
    setEnv("NEXT_PUBLIC_PUBLIC_MAP", "false");
    expect(publicMapApiPolicy(false)).toBe("unauthorized");
    // Exact-string gate: "1" and "TRUE" never open the public plane.
    setEnv("NEXT_PUBLIC_PUBLIC_MAP", "1");
    expect(publicMapApiPolicy(false)).toBe("unauthorized");
    setEnv("NEXT_PUBLIC_PUBLIC_MAP", "TRUE");
    expect(publicMapApiPolicy(false)).toBe("unauthorized");
  });

  it("anonymous requests get the public plane only when BOTH flags are exactly true", () => {
    setEnv("NEXT_PUBLIC_TATTOO_MAP", "true");
    setEnv("NEXT_PUBLIC_PUBLIC_MAP", "true");
    expect(publicMapApiPolicy(false)).toBe("public");
    // The AND gate: a stray public flag without the platform gate stays closed.
    setEnv("NEXT_PUBLIC_TATTOO_MAP", undefined);
    expect(publicMapApiPolicy(false)).toBe("unauthorized");
  });
});

describe("resolveMapCapabilities (the load-bearing permission boundary)", () => {
  it("a null viewer IS the public plane", () => {
    const caps = resolveMapCapabilities(null);
    expect(caps).toEqual(PUBLIC_MAP_CAPABILITIES);
    expect(caps.isPublic).toBe(true);
    expect(caps.canWatch).toBe(false);
    expect(caps.canApplyGuest).toBe(false);
    expect(caps.canClaim).toBe(false);
    expect(caps.canSeePersonalOverlays).toBe(false);
    expect(caps.canSeeNamedArtists).toBe(false);
    expect(caps.viewerId).toBeNull();
  });

  it("a signed-in viewer gets the full artist plane with their id", () => {
    const caps = resolveMapCapabilities("artist-1");
    expect(caps.isPublic).toBe(false);
    expect(caps.canWatch).toBe(true);
    expect(caps.canApplyGuest).toBe(true);
    expect(caps.canClaim).toBe(true);
    expect(caps.canSeePersonalOverlays).toBe(true);
    expect(caps.canSeeNamedArtists).toBe(true);
    expect(caps.viewerId).toBe("artist-1");
  });
});

describe("quantizeViewportQuery (public-plane cache keys)", () => {
  const berlin = { west: 13.19, south: 52.42, east: 13.62, north: 52.61 };

  it("floors zoom to a clamped integer", () => {
    expect(quantizeViewportQuery(berlin, 11.73).zoom).toBe(11);
    expect(quantizeViewportQuery(berlin, -4).zoom).toBe(0);
    expect(quantizeViewportQuery(berlin, 30).zoom).toBe(22);
    expect(quantizeViewportQuery(berlin, Number.NaN).zoom).toBe(3);
  });

  it("snaps outward: the quantized bbox always covers the requested viewport", () => {
    const q = quantizeViewportQuery(berlin, 11.73);
    expect(q.west).toBeLessThanOrEqual(berlin.west);
    expect(q.south).toBeLessThanOrEqual(berlin.south);
    expect(q.east).toBeGreaterThanOrEqual(berlin.east);
    expect(q.north).toBeGreaterThanOrEqual(berlin.north);
  });

  it("is exactly idempotent, so equal viewports produce byte-equal URLs", () => {
    const once = quantizeViewportQuery(berlin, 11.73);
    const twice = quantizeViewportQuery(once, once.zoom);
    expect(twice).toEqual(once);
    expect(String(twice.west)).toBe(String(once.west));
    expect(String(twice.east)).toBe(String(once.east));
  });

  it("collides nearby viewports onto one key", () => {
    const nudged = {
      west: berlin.west + 0.0004,
      south: berlin.south - 0.0004,
      east: berlin.east + 0.0004,
      north: berlin.north - 0.0004,
    };
    expect(quantizeViewportQuery(nudged, 11.2)).toEqual(
      quantizeViewportQuery(berlin, 11.9),
    );
  });

  it("clamps to the valid lat/lng ranges at the world view", () => {
    const world = { west: -180, south: -85, east: 180, north: 85 };
    const q = quantizeViewportQuery(world, 0);
    expect(q.west).toBe(-180);
    expect(q.east).toBe(180);
    expect(q.south).toBeGreaterThanOrEqual(-90);
    expect(q.north).toBeLessThanOrEqual(90);
  });
});
