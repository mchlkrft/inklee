import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Go-live plan S2b server gates: the four test-locks the plan names beyond the
 * pure functions (robots per gate state on the real page module, 404 for
 * anything non-renderable, the sitemap carrying only gate-passers, and slug
 * collision handling). The pure gate and slug logic are covered in
 * studio-page.test.ts.
 */

type Row = Record<string, unknown> | null;
type TableState = {
  studio_profiles?: Row;
  map_locations?: Row;
  studio_categories?: Row[];
  studio_photos?: Row[];
  map_duplicate_suggestions?: Row;
  /** Slugs already taken by OTHER studios, for the collision walk. */
  takenSlugs?: string[];
  /** Rows written by ensureStudioSlug's update, for assertions. */
  written?: Array<Record<string, unknown>>;
  /** Force the studio read to fail, to prove a blip is not a 404. */
  studioReadError?: string;
};

const state: TableState = {};

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: (col: string, value: unknown) => {
      filters[col] = value;
      return chain;
    },
    is: self,
    not: self,
    or: self,
    in: self,
    order: self,
    limit: self,
    maybeSingle: async () => {
      if (table === "studio_profiles") {
        if (state.studioReadError) {
          return { data: null, error: { message: state.studioReadError } };
        }
        // Lookups by slug serve two callers: the page read (the seeded
        // studio's own slug resolves to its row) and ensureStudioSlug's
        // collision probe (a candidate held by ANOTHER studio is "taken").
        if (typeof filters.slug === "string") {
          if ((state.takenSlugs ?? []).includes(filters.slug as string)) {
            return { data: { id: "other-studio" }, error: null };
          }
          const own = state.studio_profiles as Record<string, unknown> | null;
          return {
            data: own && own.slug === filters.slug ? own : null,
            error: null,
          };
        }
        return { data: state.studio_profiles ?? null, error: null };
      }
      if (table === "map_locations")
        return { data: state.map_locations ?? null, error: null };
      if (table === "map_duplicate_suggestions")
        return { data: state.map_duplicate_suggestions ?? null, error: null };
      return { data: null, error: null };
    },
    update: (values: Record<string, unknown>) => {
      const updateChain: Record<string, unknown> = {};
      Object.assign(updateChain, {
        eq: () => updateChain,
        is: () => updateChain,
        select: async () => {
          state.written = [...(state.written ?? []), values];
          return { data: [{ slug: values.slug }], error: null };
        },
      });
      return updateChain;
    },
    then: undefined,
  });
  // Promise-like for the array reads (select().eq() awaited directly).
  (chain as { then: unknown }).then = (
    resolve: (v: { data: unknown; error: unknown }) => unknown,
  ) => {
    const data =
      table === "studio_categories"
        ? (state.studio_categories ?? [])
        : table === "studio_photos"
          ? (state.studio_photos ?? [])
          : [];
    return Promise.resolve({ data, error: null }).then(resolve);
  };
  return chain;
}

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: (table: string) => builder(table) },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
const rateLimitAllowed = { value: true };
vi.mock("@/lib/ratelimit", () => ({
  checkPublicMapDetailRateLimit: async () => ({
    allowed: rateLimitAllowed.value,
  }),
}));
vi.mock("@/lib/server/studio-styles", () => ({
  getStudioStyles: vi.fn(async () => ({
    specialties: [],
    guestStyles: [],
    isEmpty: true,
  })),
}));
vi.mock("@/lib/server/studios", () => ({
  getPublishedHouseRules: vi.fn(async () => []),
}));
vi.mock("@/lib/server/guest-spots", () => ({
  getStudioGuestTimeline: vi.fn(async () => ({
    current: [],
    upcoming: [],
    past: [],
  })),
}));

import {
  getPublicStudioPage,
  ensureStudioSlug,
  StudioPageReadError,
} from "@/lib/server/studio-page";
import { generateMetadata } from "@/app/studios/[slug]/page";

const ORIGINAL_TATTOO = process.env.NEXT_PUBLIC_TATTOO_MAP;
const ORIGINAL_PUBLIC = process.env.NEXT_PUBLIC_PUBLIC_MAP;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function seedGatePassing() {
  state.studio_profiles = {
    id: "studio-1",
    slug: "black-needle",
    name: "Black Needle",
    description: "A studio in Berlin.",
    vibe: null,
    address_visibility: "exact",
    guest_spot_status: "accepting",
    publication_status: "published",
    logo_path: "studio-1/logo.webp",
    show_guest_timeline: false,
  };
  state.map_locations = {
    id: "loc-1",
    category: "tattoo_studio",
    claim_status: "claimed",
    moderation_status: "approved",
    possibly_closed: false,
    last_confirmed_at: null,
    address: "Somestrasse 1",
    city: "Berlin",
    country: "DE",
    display_latitude: 52.52,
    display_longitude: 13.405,
    website_url: null,
    instagram_handle: null,
  };
  state.studio_categories = [
    { kind: "standard", standard_key: "street_shop", custom_label: null },
    { kind: "standard", standard_key: "walk_in_friendly", custom_label: null },
    { kind: "custom", standard_key: null, custom_label: "Coffee" },
  ];
  state.studio_photos = [
    { storage_path: "studio-1/a.webp", position: 0 },
    { storage_path: "studio-1/b.webp", position: 1 },
    { storage_path: "studio-1/c.webp", position: 2 },
  ];
  state.map_duplicate_suggestions = null;
}

beforeEach(() => {
  for (const key of Object.keys(state)) {
    delete (state as Record<string, unknown>)[key];
  }
  setEnv("NEXT_PUBLIC_TATTOO_MAP", "true");
  setEnv("NEXT_PUBLIC_PUBLIC_MAP", "true");
  seedGatePassing();
});

afterEach(() => {
  setEnv("NEXT_PUBLIC_TATTOO_MAP", ORIGINAL_TATTOO);
  setEnv("NEXT_PUBLIC_PUBLIC_MAP", ORIGINAL_PUBLIC);
});

describe("getPublicStudioPage renderability (404 instead of a thin page)", () => {
  it("renders a gate-passing studio", async () => {
    const page = await getPublicStudioPage("black-needle");
    expect(page).not.toBeNull();
    expect(page?.indexability.indexable).toBe(true);
  });

  it.each([
    ["unknown slug", () => (state.studio_profiles = null)],
    [
      "unclaimed location",
      () =>
        ((state.map_locations as Record<string, unknown>).claim_status =
          "unclaimed"),
    ],
    [
      "draft studio",
      () =>
        ((state.studio_profiles as Record<string, unknown>).publication_status =
          "draft"),
    ],
    [
      "hidden location",
      () =>
        ((state.map_locations as Record<string, unknown>).moderation_status =
          "hidden"),
    ],
    [
      "removed location",
      () =>
        ((state.map_locations as Record<string, unknown>).moderation_status =
          "removed"),
    ],
    ["no linked location", () => (state.map_locations = null)],
  ])("returns null for %s", async (_label, mutate) => {
    mutate();
    expect(await getPublicStudioPage("black-needle")).toBeNull();
  });

  it("THROWS on a read failure rather than reporting the page as missing", async () => {
    state.studioReadError = "connection reset";
    await expect(getPublicStudioPage("black-needle")).rejects.toBeInstanceOf(
      StudioPageReadError,
    );
  });
});

describe("indexability blockers on the real read model", () => {
  it("noindexes a possibly-closed studio (still renders)", async () => {
    (state.map_locations as Record<string, unknown>).possibly_closed = true;
    const page = await getPublicStudioPage("black-needle");
    expect(page).not.toBeNull();
    expect(page?.indexability.indexable).toBe(false);
    expect(page?.indexability.blockers).toContain("possibly_closed");
  });

  it("noindexes a studio with an open duplicate suggestion", async () => {
    state.map_duplicate_suggestions = { id: "dup-1" };
    const page = await getPublicStudioPage("black-needle");
    expect(page?.indexability.blockers).toContain("open_duplicate");
  });

  it("noindexes when the publish minimums regress after publishing", async () => {
    state.studio_photos = [{ storage_path: "studio-1/a.webp", position: 0 }];
    const page = await getPublicStudioPage("black-needle");
    expect(page?.indexability.blockers).toContain("publish_gate_incomplete");
  });

  it("noindexes everything while the public surface is dark", async () => {
    setEnv("NEXT_PUBLIC_PUBLIC_MAP", undefined);
    const page = await getPublicStudioPage("black-needle");
    expect(page?.indexability.indexable).toBe(false);
    expect(page?.indexability.blockers).toContain("public_surface_dark");
  });
});

describe("private studio and address handling", () => {
  it("withholds the street address and geo for a private studio, whatever the stored visibility", async () => {
    (state.map_locations as Record<string, unknown>).category =
      "private_studio";
    const page = await getPublicStudioPage("black-needle");
    expect(page?.streetAddress).toBeNull();
    expect(page?.geo).toBeNull();
    expect(page?.city).toBe("Berlin");
  });

  it("withholds the street address and geo for an approximate-location studio", async () => {
    (state.studio_profiles as Record<string, unknown>).address_visibility =
      "approximate";
    const page = await getPublicStudioPage("black-needle");
    expect(page?.streetAddress).toBeNull();
    expect(page?.geo).toBeNull();
  });

  it("publishes both only when the owner shows the exact address", async () => {
    const page = await getPublicStudioPage("black-needle");
    expect(page?.streetAddress).toBe("Somestrasse 1");
    expect(page?.geo).toEqual({ lat: 52.52, lng: 13.405 });
  });
});

describe("page metadata robots per gate state", () => {
  const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

  it("indexes only a gate-passing page", async () => {
    const meta = await generateMetadata(params("black-needle"));
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe("/studios/black-needle");
  });

  it("noindexes a page that renders but fails the gate", async () => {
    (state.map_locations as Record<string, unknown>).possibly_closed = true;
    const meta = await generateMetadata(params("black-needle"));
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("noindexes when the public surface is dark", async () => {
    setEnv("NEXT_PUBLIC_PUBLIC_MAP", undefined);
    const meta = await generateMetadata(params("black-needle"));
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("noindexes a throttled request, so a placeholder body can never be indexed", async () => {
    rateLimitAllowed.value = false;
    try {
      const meta = await generateMetadata(params("black-needle"));
      expect(meta.robots).toEqual({ index: false, follow: true });
    } finally {
      rateLimitAllowed.value = true;
    }
  });
});

describe("ensureStudioSlug", () => {
  it("is a no-op when a slug already exists (the stability rule)", async () => {
    const result = await ensureStudioSlug("studio-1");
    expect(result.slug).toBe("black-needle");
    expect(state.written ?? []).toHaveLength(0);
  });

  it("walks past a taken candidate to the next free one", async () => {
    state.studio_profiles = {
      id: "studio-1",
      slug: null,
      name: "Black Needle",
      city: "Berlin",
    };
    state.takenSlugs = ["black-needle"];
    const result = await ensureStudioSlug("studio-1");
    expect(result.slug).toBe("black-needle-berlin");
  });

  it("falls back to a stable id-derived slug when the name yields nothing", async () => {
    state.studio_profiles = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      slug: null,
      name: "!!!",
      city: null,
    };
    const result = await ensureStudioSlug(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    expect(result.slug).toBe("studio-aaaaaaaabbbb");
  });
});
