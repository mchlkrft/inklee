import { describe, it, expect, vi, beforeEach } from "vitest";

import { VIEWER_DETAIL_KEYS } from "@inklee/shared/map-location-detail";

/**
 * Go-live plan S1: the detail read-model plane split. The public payload must
 * be viewer-independent BY CONSTRUCTION (a CDN-cached anonymous response can
 * never carry watch state or ownership), and the authed composition must keep
 * the pre-split wire shape for the web panel and the /api/mobile/map twin.
 */

// serviceClient mock: per-table maybeSingle results, chainable like the real
// PostgREST builder (select/eq/eq/maybeSingle).
const tableData: Record<string, unknown> = {};
function makeChain(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () =>
      Promise.resolve(
        (tableData[table] as { data: unknown } | undefined) ?? { data: null },
      ),
  };
  return chain;
}
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: (table: string) => makeChain(table) },
}));
vi.mock("@/lib/server/studio-styles", () => ({
  getStudioStyles: vi.fn(async () => ({
    specialties: [{ key: "blackwork", label: "Blackwork" }],
    guestStyles: [],
    isEmpty: false,
  })),
}));
vi.mock("@/lib/server/studios", () => ({
  getPublishedHouseRules: vi.fn(async () => [
    { key: "deposit_policy", content: "Deposits required." },
  ]),
}));
vi.mock("@/lib/server/guest-spots", () => ({
  getStudioGuestTimeline: vi.fn(async () => ({
    current: [],
    upcoming: [],
    past: [],
  })),
}));
vi.mock("@/lib/server/studio-signals", () => ({
  activeSignalsByLocation: vi.fn(async () => new Map()),
}));

import {
  getMapLocationDetail,
  getPublicMapLocationDetail,
} from "@/lib/server/map-location-detail";

const APPROVED_SEED = {
  data: {
    id: "loc-1",
    name: "Black Needle",
    category: "tattoo_studio",
    address: "Somestrasse 1",
    city: "Berlin",
    country: "DE",
    website_url: "https://example.com",
    instagram_handle: "blackneedle",
    phone: null,
    opening_hours: null,
    claim_status: "unclaimed",
    is_seed: true,
    last_confirmed_at: null,
    possibly_closed: false,
    studio_profile_id: null,
  },
};

const CLAIMED_LOCATION = {
  data: {
    ...APPROVED_SEED.data,
    claim_status: "claimed",
    is_seed: false,
    studio_profile_id: "studio-1",
  },
};

beforeEach(() => {
  for (const key of Object.keys(tableData)) delete tableData[key];
});

describe("getPublicMapLocationDetail (anonymous plane)", () => {
  it("returns null for a missing or unapproved location", async () => {
    tableData["map_locations"] = { data: null };
    expect(await getPublicMapLocationDetail("nope")).toBeNull();
  });

  it("is viewer-independent by construction: no viewer key is ever present", async () => {
    tableData["map_locations"] = CLAIMED_LOCATION;
    tableData["studio_profiles"] = {
      data: {
        owner_user_id: "owner-1",
        publication_status: "published",
        guest_spot_status: "accepting",
      },
    };
    // Even a stale watch row in the table can never surface anonymously.
    tableData["watched_studios"] = { data: { id: "watch-1" } };

    const detail = await getPublicMapLocationDetail("loc-1");
    expect(detail).not.toBeNull();
    for (const key of VIEWER_DETAIL_KEYS) {
      expect(key in (detail as object)).toBe(false);
    }
    expect(detail?.requestable).toBe(true);
    expect(detail?.claimed).toBe(true);
    expect(detail?.styles?.isEmpty).toBe(false);
  });

  it("pins the exact public key allowlist, so any new field forces a conscious plane decision", async () => {
    tableData["map_locations"] = CLAIMED_LOCATION;
    tableData["studio_profiles"] = {
      data: {
        owner_user_id: "owner-1",
        publication_status: "published",
        guest_spot_status: "accepting",
      },
    };
    const detail = await getPublicMapLocationDetail("loc-1");
    // A new field added to the SHARED payload appears on the anonymous (and
    // CDN-cached) plane. This literal list makes that a failing test instead
    // of a silent default: extend it only after classifying the field as
    // genuinely viewer-independent (else it belongs in MapViewerLocationState).
    expect(Object.keys(detail as object).sort()).toEqual(
      [
        "address",
        "category",
        "city",
        "claimed",
        "country",
        "houseRules",
        "id",
        "instagram",
        "lastConfirmedAt",
        "name",
        "openingHours",
        "phone",
        "possiblyClosed",
        "requestable",
        "signal",
        "studioSlug",
        "styles",
        "timeline",
        "unverified",
        "website",
      ].sort(),
    );
  });

  it("marks an unclaimed seed unverified and not requestable", async () => {
    tableData["map_locations"] = APPROVED_SEED;
    const detail = await getPublicMapLocationDetail("loc-1");
    expect(detail?.unverified).toBe(true);
    expect(detail?.requestable).toBe(false);
    expect(detail?.styles).toBeNull();
  });

  it("withholds the street address of an unclaimed private studio by construction", async () => {
    tableData["map_locations"] = {
      data: {
        ...APPROVED_SEED.data,
        category: "private_studio",
        address: "Privatweg 5",
      },
    };
    const detail = await getPublicMapLocationDetail("loc-1");
    expect(detail?.address).toBeNull();
    expect(detail?.city).toBe("Berlin");

    // A CLAIMED private studio's visibility is owner-controlled upstream, so
    // the guard does not apply there.
    tableData["map_locations"] = {
      data: {
        ...APPROVED_SEED.data,
        category: "private_studio",
        address: "Privatweg 5",
        claim_status: "claimed",
        is_seed: false,
        studio_profile_id: "studio-1",
      },
    };
    tableData["studio_profiles"] = {
      data: {
        owner_user_id: "owner-1",
        publication_status: "published",
        guest_spot_status: "not_accepting",
      },
    };
    const claimed = await getPublicMapLocationDetail("loc-1");
    expect(claimed?.address).toBe("Privatweg 5");
  });
});

describe("getMapLocationDetail (authed composition)", () => {
  it("is the shared payload plus exactly the viewer decoration", async () => {
    tableData["map_locations"] = CLAIMED_LOCATION;
    tableData["studio_profiles"] = {
      data: {
        owner_user_id: "owner-1",
        publication_status: "published",
        guest_spot_status: "accepting",
      },
    };
    tableData["watched_studios"] = { data: { id: "watch-1" } };

    const [shared, authed] = await Promise.all([
      getPublicMapLocationDetail("loc-1"),
      getMapLocationDetail("loc-1", "owner-1"),
    ]);
    expect(authed?.watched).toBe(true);
    expect(authed?.ownStudio).toBe(true);
    // Structural subset: the public payload is the authed payload minus the
    // viewer keys, nothing more and nothing less.
    const authedKeys = new Set(Object.keys(authed as object));
    for (const key of Object.keys(shared as object)) {
      expect(authedKeys.has(key)).toBe(true);
    }
    expect(authedKeys.size).toBe(
      Object.keys(shared as object).length + VIEWER_DETAIL_KEYS.length,
    );
  });

  it("resolves watched=false and ownStudio=false for an unrelated viewer", async () => {
    tableData["map_locations"] = CLAIMED_LOCATION;
    tableData["studio_profiles"] = {
      data: {
        owner_user_id: "owner-1",
        publication_status: "published",
        guest_spot_status: "not_accepting",
      },
    };
    tableData["watched_studios"] = { data: null };

    const detail = await getMapLocationDetail("loc-1", "someone-else");
    expect(detail?.watched).toBe(false);
    expect(detail?.ownStudio).toBe(false);
    expect(detail?.requestable).toBe(false);
  });

  it("never marks ownStudio for locations without a studio profile", async () => {
    tableData["map_locations"] = APPROVED_SEED;
    tableData["watched_studios"] = { data: null };
    const detail = await getMapLocationDetail("loc-1", "anyone");
    expect(detail?.ownStudio).toBe(false);
  });
});
