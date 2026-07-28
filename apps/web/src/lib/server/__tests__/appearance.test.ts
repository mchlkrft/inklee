import { describe, it, expect, vi, beforeEach } from "vitest";

// The server appearance resolver's entitlement boundary (Plus build P1).
// The guarantees that matter: Free keeps exactly what it has today, a
// downgrade never blanks a public page, and a plan-read blip fails SAFE to
// the Free view rather than 500ing a public render.

const getAccountOverrides = vi.fn();
const appearanceCustomAllowed = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/entitlement-gates", () => ({
  appearanceCustomAllowed: (...a: unknown[]) => appearanceCustomAllowed(...a),
}));

import { surfaceAppearance } from "@/lib/server/appearance";

// An artist who customized the full stack.
const CUSTOMIZED = {
  cover_color: "mustard",
  cover_image_url: "https://cdn.example/cover.webp",
  appearance: {
    global: {
      theme: "dark",
      accent: "cobalt",
      font: "mono",
      buttonRadius: "round",
      buttonTreatment: "outline",
    },
    surfaces: { hub: { font: "serif" } },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getAccountOverrides.mockResolvedValue({});
});

describe("surfaceAppearance entitlement boundary", () => {
  it("entitled: the full custom layer resolves, including the surface override", async () => {
    appearanceCustomAllowed.mockReturnValue(true);
    const a = await surfaceAppearance("artist-1", CUSTOMIZED, "hub");
    expect(a.theme).toBe("dark");
    expect(a.resolved.font).toBe("serif"); // hub override beats global mono
    expect(a.resolved.buttonRadius).toBe("round");
    expect(a.cssVars["--appearance-accent"]).toBe("#0b3d9f");
    expect(a.cssVars).toHaveProperty("--appearance-font");
  });

  it("NOT entitled: keeps theme, accent and background (today's free features)", async () => {
    appearanceCustomAllowed.mockReturnValue(false);
    const a = await surfaceAppearance("artist-1", CUSTOMIZED, "hub");
    expect(a.theme).toBe("dark");
    expect(a.resolved.accent).toBe("cobalt");
    expect(a.resolved.backgroundImageUrl).toBe(
      "https://cdn.example/cover.webp",
    );
  });

  it("NOT entitled: drops ONLY the custom layer, never blanking the page", async () => {
    appearanceCustomAllowed.mockReturnValue(false);
    const a = await surfaceAppearance("artist-1", CUSTOMIZED, "hub");
    expect(a.resolved.font).toBe("inklee"); // default, not the custom serif
    expect(a.resolved.buttonRadius).toBe("soft");
    expect(a.resolved.buttonTreatment).toBe("solid");
    expect(a.cssVars).not.toHaveProperty("--appearance-font");
    // The accent survives because a preset cover color is a FREE feature.
    expect(a.cssVars["--appearance-accent"]).toBe("#0b3d9f");
  });

  it("a plan-read failure fails SAFE to the free view (never throws)", async () => {
    getAccountOverrides.mockRejectedValue(new Error("db down"));
    await expect(
      surfaceAppearance("artist-1", CUSTOMIZED, "hub"),
    ).resolves.toMatchObject({ theme: "dark" });
  });

  it("an unconfigured artist emits no css vars at all", async () => {
    appearanceCustomAllowed.mockReturnValue(true);
    const a = await surfaceAppearance("artist-1", {}, "bookingForm");
    expect(a.cssVars).toEqual({});
    expect(a.theme).toBe("light");
  });

  it("a legacy-only artist renders their cover appearance on either tier", async () => {
    const legacy = { cover_color: "rosa" };
    for (const entitled of [true, false]) {
      appearanceCustomAllowed.mockReturnValue(entitled);
      const a = await surfaceAppearance("artist-1", legacy, "hub");
      expect(a.cssVars["--appearance-accent"]).toBe("#db88b9");
    }
  });
});

describe("template entitlement (P2)", () => {
  it("entitled: the chosen template resolves", async () => {
    appearanceCustomAllowed.mockReturnValue(true);
    const a = await surfaceAppearance(
      "artist-1",
      { appearance: { global: { template: "bold" } } },
      "hub",
    );
    expect(a.resolved.template).toBe("bold");
  });

  it("NOT entitled: falls back to the clean Free layout, never a blank page", async () => {
    appearanceCustomAllowed.mockReturnValue(false);
    const a = await surfaceAppearance(
      "artist-1",
      { appearance: { global: { template: "editorial" } } },
      "hub",
    );
    expect(a.resolved.template).toBe("clean");
  });

  it("a downgrade keeps the stored template for a later re-upgrade", async () => {
    const settings = { appearance: { global: { template: "portfolio" } } };
    appearanceCustomAllowed.mockReturnValue(false);
    expect(
      (await surfaceAppearance("a", settings, "hub")).resolved.template,
    ).toBe("clean");
    appearanceCustomAllowed.mockReturnValue(true);
    expect(
      (await surfaceAppearance("a", settings, "hub")).resolved.template,
    ).toBe("portfolio");
  });
});
