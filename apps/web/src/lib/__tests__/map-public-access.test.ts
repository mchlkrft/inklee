import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Go-live plan S1 gate tests above the pure-policy level: the access resolver
 * matrix (404/401/429/public/authed), refuse-before-work ordering, and the
 * per-route plane behavior (cache headers only on the public branch, viewer
 * keys only on the authed branch, artists closed to the public plane per D2).
 */

// --- mocks -----------------------------------------------------------------

let currentUser: { id: string } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));

type LimitCheck = (ip: string) => Promise<{ allowed: boolean }>;
const pinsLimit = vi.fn<LimitCheck>(async () => ({ allowed: true }));
const detailLimit = vi.fn<LimitCheck>(async () => ({ allowed: true }));
const searchLimit = vi.fn<LimitCheck>(async () => ({ allowed: true }));
vi.mock("@/lib/ratelimit", () => ({
  checkPublicMapPinsRateLimit: (ip: string) => pinsLimit(ip),
  checkPublicMapDetailRateLimit: (ip: string) => detailLimit(ip),
  checkPublicMapSearchRateLimit: (ip: string) => searchLimit(ip),
}));

const publicDetail = vi.fn();
const authedDetail = vi.fn();
vi.mock("@/lib/server/map-location-detail", () => ({
  getPublicMapLocationDetail: (id: string) => publicDetail(id),
  getMapLocationDetail: (id: string, userId: string) =>
    authedDetail(id, userId),
}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => {
      throw new Error("unexpected table access in this test");
    },
  },
}));
vi.mock("@/lib/server/studio-signals", () => ({
  activeSignalsByLocation: vi.fn(async () => new Map()),
}));

import { resolveMapApiAccess } from "@/lib/server/map-public-access";
import { GET as detailGET } from "@/app/api/map/locations/[id]/route";
import { GET as searchGET } from "@/app/api/map/search/route";
import { GET as artistsGET } from "@/app/api/map/artists/route";

const ORIGINAL_TATTOO_MAP = process.env.NEXT_PUBLIC_TATTOO_MAP;
const ORIGINAL_PUBLIC_MAP = process.env.NEXT_PUBLIC_PUBLIC_MAP;

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function flags(tattoo: string | undefined, publicMap: string | undefined) {
  setEnv("NEXT_PUBLIC_TATTOO_MAP", tattoo);
  setEnv("NEXT_PUBLIC_PUBLIC_MAP", publicMap);
}

const REQ = new Request("https://inklee.app/api/map/search?q=berlin", {
  headers: { "x-forwarded-for": "203.0.113.7" },
});

const SHARED_DETAIL = { id: "loc-1", name: "Black Needle", requestable: true };
const AUTHED_DETAIL = { ...SHARED_DETAIL, watched: true, ownStudio: false };

beforeEach(() => {
  currentUser = null;
  pinsLimit.mockClear().mockResolvedValue({ allowed: true });
  detailLimit.mockClear().mockResolvedValue({ allowed: true });
  searchLimit.mockClear().mockResolvedValue({ allowed: true });
  publicDetail.mockReset().mockResolvedValue(SHARED_DETAIL);
  authedDetail.mockReset().mockResolvedValue(AUTHED_DETAIL);
  rpc.mockReset().mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  setEnv("NEXT_PUBLIC_TATTOO_MAP", ORIGINAL_TATTOO_MAP);
  setEnv("NEXT_PUBLIC_PUBLIC_MAP", ORIGINAL_PUBLIC_MAP);
});

describe("resolveMapApiAccess (the S1 enforcement matrix)", () => {
  it("404s when the platform gate is off, before auth or limits", async () => {
    flags(undefined, "true");
    const access = await resolveMapApiAccess(REQ, "pins");
    expect(access.kind).toBe("refused");
    if (access.kind === "refused") expect(access.response.status).toBe(404);
    expect(pinsLimit).not.toHaveBeenCalled();
  });

  it("refuses anonymous requests with 401 while the public flag is off (rollback story)", async () => {
    flags("true", undefined);
    const access = await resolveMapApiAccess(REQ, "pins");
    expect(access.kind).toBe("refused");
    if (access.kind === "refused") expect(access.response.status).toBe(401);
    expect(pinsLimit).not.toHaveBeenCalled();
  });

  it("grants the public plane to anonymous requests only after the limiter allows", async () => {
    flags("true", "true");
    const access = await resolveMapApiAccess(REQ, "pins");
    expect(access.kind).toBe("public");
    expect(pinsLimit).toHaveBeenCalledWith("203.0.113.7");
    if (access.kind === "public") {
      expect(access.capabilities.isPublic).toBe(true);
      expect(access.capabilities.canSeePersonalOverlays).toBe(false);
      expect(access.capabilities.viewerId).toBeNull();
    }
  });

  it("429s the public plane when the limiter denies (refuse-before-work)", async () => {
    flags("true", "true");
    searchLimit.mockResolvedValue({ allowed: false });
    const access = await resolveMapApiAccess(REQ, "search");
    expect(access.kind).toBe("refused");
    if (access.kind === "refused") expect(access.response.status).toBe(429);
  });

  it("authed viewers never touch the public limiter, with or without the public flag", async () => {
    currentUser = { id: "artist-1" };
    for (const publicFlag of [undefined, "true"] as const) {
      flags("true", publicFlag);
      const access = await resolveMapApiAccess(REQ, "detail");
      expect(access.kind).toBe("authed");
      if (access.kind === "authed") {
        expect(access.userId).toBe("artist-1");
        expect(access.capabilities.canSeePersonalOverlays).toBe(true);
      }
    }
    expect(detailLimit).not.toHaveBeenCalled();
  });
});

describe("detail route planes (cache headers + viewer keys)", () => {
  const params = { params: Promise.resolve({ id: "loc-1" }) };

  it("public branch: shared payload, public cache headers, Vary: Cookie", async () => {
    flags("true", "true");
    const res = await detailGET(REQ, params);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("public");
    expect(res.headers.get("Vary")).toBe("Cookie");
    const body = await res.json();
    expect(publicDetail).toHaveBeenCalledWith("loc-1");
    expect(authedDetail).not.toHaveBeenCalled();
    expect("watched" in body.detail).toBe(false);
    expect("ownStudio" in body.detail).toBe(false);
  });

  it("authed branch: composed payload, private no-store, never the public limiter", async () => {
    flags("true", "true");
    currentUser = { id: "artist-1" };
    const res = await detailGET(REQ, params);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await res.json();
    expect(authedDetail).toHaveBeenCalledWith("loc-1", "artist-1");
    expect(body.detail.watched).toBe(true);
    expect(detailLimit).not.toHaveBeenCalled();
  });

  it("anonymous flag-off refusal is a plain 401 with no cache headers", async () => {
    flags("true", undefined);
    const res = await detailGET(REQ, params);
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBeNull();
    expect(publicDetail).not.toHaveBeenCalled();
  });
});

describe("search route public plane", () => {
  it("caps the needle length on the same empty-result path as too-short input", async () => {
    flags("true", "true");
    const long = new Request(
      `https://inklee.app/api/map/search?q=${"a".repeat(300)}`,
      { headers: { "x-forwarded-for": "203.0.113.7" } },
    );
    const res = await searchGET(long);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
    expect(rpc).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toContain("public");
  });

  it("serves real queries through the RPC with public cache headers", async () => {
    flags("true", "true");
    const res = await searchGET(REQ);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("map_search", {
      p_q: "berlin",
      p_limit: 8,
    });
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });
});

describe("artists route stays closed to the public plane (founder D2)", () => {
  it("refuses anonymous requests even with both flags on", async () => {
    flags("true", "true");
    const res = await artistsGET();
    expect(res.status).toBe(401);
  });
});
