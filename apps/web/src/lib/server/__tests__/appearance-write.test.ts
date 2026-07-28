import { describe, it, expect, vi, beforeEach } from "vitest";

// The shared appearance write path (Plus build P1b). What must hold: the
// entitlement is enforced server-side (not hidden in a UI), sibling settings
// keys survive the write, the first save captures the artist's CURRENT
// (legacy-derived) appearance instead of resetting it, and a plan-read blip
// refuses the write rather than persisting an unverified shape.

const getAccountOverrides = vi.fn();
const appearanceCustomAllowed = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  appearanceCustomAllowed: (...a: unknown[]) => appearanceCustomAllowed(...a),
}));

import { saveAppearanceCore } from "@/lib/server/appearance-write";

let stored: Record<string, unknown>;
let updatePayload: Record<string, unknown> | null;
let readError: { message: string } | null;
let writeError: { message: string } | null;

function client() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({
      data: readError ? null : { settings: stored },
      error: readError,
    }),
    update: (payload: Record<string, unknown>) => {
      updatePayload = payload;
      return {
        eq: async () => ({ error: writeError }),
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => chain } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  stored = {};
  updatePayload = null;
  readError = null;
  writeError = null;
  getAccountOverrides.mockResolvedValue({});
  appearanceCustomAllowed.mockReturnValue(true);
});

describe("saveAppearanceCore entitlement", () => {
  it("refuses an unentitled save BEFORE reading or writing", async () => {
    appearanceCustomAllowed.mockReturnValue(false);
    const r = await saveAppearanceCore(client(), "artist-1", { font: "mono" });
    expect(r).toMatchObject({ ok: false, code: "not_entitled" });
    expect(updatePayload).toBeNull();
  });

  it("refuses the write when the plan read blows up", async () => {
    // Deliberately the opposite of the RENDER path (which fails safe to the
    // free view): persisting an entitled-only shape on an unverified plan is
    // the worse error.
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    const r = await saveAppearanceCore(client(), "artist-1", { font: "mono" });
    expect(r).toMatchObject({ ok: false, code: "failed" });
    expect(updatePayload).toBeNull();
  });
});

describe("saveAppearanceCore writes", () => {
  it("MERGES into settings, never replacing sibling keys", async () => {
    stored = {
      bio_page: { blocks: [] },
      books_settings: { open: true },
      cover_color: "mustard",
    };
    const r = await saveAppearanceCore(client(), "artist-1", { font: "mono" });
    expect(r.ok).toBe(true);
    const settings = updatePayload!.settings as Record<string, unknown>;
    expect(settings.bio_page).toEqual({ blocks: [] });
    expect(settings.books_settings).toEqual({ open: true });
    expect(settings.cover_color).toBe("mustard");
  });

  it("captures the artist's CURRENT legacy appearance on the first save", async () => {
    // Their page is already mustard-on-dark; saving a font must not silently
    // reset either of those to the defaults.
    stored = {
      cover_color: "mustard",
      books_settings: { form_appearance: "dark" },
    };
    await saveAppearanceCore(client(), "artist-1", { font: "mono" });
    const appearance = (updatePayload!.settings as Record<string, unknown>)
      .appearance as { global: Record<string, unknown> };
    expect(appearance.global.font).toBe("mono");
    expect(appearance.global.accent).toBe("mustard");
    expect(appearance.global.theme).toBe("dark");
  });

  it("scopes a surface override without touching the global", async () => {
    stored = { appearance: { global: { font: "serif" }, surfaces: {} } };
    await saveAppearanceCore(client(), "artist-1", {
      font: "mono",
      surface: "hub",
    });
    const appearance = (updatePayload!.settings as Record<string, unknown>)
      .appearance as {
      global: Record<string, unknown>;
      surfaces: Record<string, unknown>;
    };
    expect(appearance.global.font).toBe("serif");
    expect(appearance.surfaces.hub).toMatchObject({ font: "mono" });
  });

  it("merges into an EXISTING surface override rather than replacing it", async () => {
    stored = {
      appearance: {
        global: {},
        surfaces: { hub: { font: "mono", buttonRadius: "round" } },
      },
    };
    await saveAppearanceCore(client(), "artist-1", {
      font: "serif",
      surface: "hub",
    });
    const surfaces = (
      (updatePayload!.settings as Record<string, unknown>).appearance as {
        surfaces: Record<string, Record<string, unknown>>;
      }
    ).surfaces;
    expect(surfaces.hub.font).toBe("serif");
    expect(surfaces.hub.buttonRadius).toBe("round");
  });

  it("drops unknown values instead of failing the whole save", async () => {
    const r = await saveAppearanceCore(client(), "artist-1", {
      font: "comic",
      theme: "light",
    });
    expect(r.ok).toBe(true);
    const appearance = (updatePayload!.settings as Record<string, unknown>)
      .appearance as { global: Record<string, unknown> };
    expect(appearance.global.font).toBe("inklee"); // default, not "comic"
    expect(appearance.global.theme).toBe("light");
  });

  it("treats an all-unknown patch as nothing to save", async () => {
    const r = await saveAppearanceCore(client(), "artist-1", { font: "comic" });
    expect(r).toMatchObject({ ok: false, code: "invalid" });
    expect(updatePayload).toBeNull();
  });

  it("clears the accent when passed null explicitly", async () => {
    stored = { cover_color: "mustard" };
    await saveAppearanceCore(client(), "artist-1", { accent: null });
    const appearance = (updatePayload!.settings as Record<string, unknown>)
      .appearance as { global: Record<string, unknown> };
    expect(appearance.global.accent).toBeNull();
  });

  it("surfaces a read failure without writing", async () => {
    readError = { message: "boom" };
    const r = await saveAppearanceCore(client(), "artist-1", { font: "mono" });
    expect(r).toMatchObject({ ok: false, code: "failed" });
    expect(updatePayload).toBeNull();
  });

  it("surfaces a write failure", async () => {
    writeError = { message: "boom" };
    const r = await saveAppearanceCore(client(), "artist-1", { font: "mono" });
    expect(r).toMatchObject({ ok: false, code: "failed" });
  });
});
