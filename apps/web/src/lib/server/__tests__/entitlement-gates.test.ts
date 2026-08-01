import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_OVERRIDES, type AccountOverrides } from "@/lib/entitlements";

// Control the dark-launch kill switch deterministically.
const disabled = vi.fn((_c: string) => false);
vi.mock("@/lib/server/app-config", () => ({
  isCapabilityDisabled: (c: string) => disabled(c),
}));

import {
  brandingRemoved,
  appearanceCustomAllowed,
  richContentBlocksAllowed,
  conditionalQuestionsAllowed,
  formCustomAllowed,
  largeProjectsAllowed,
  goodsDiscountsAllowed,
  goodsSchedulingAllowed,
  goodsCollectionsAllowed,
  canEditTemplates,
  canSeeAdvancedAnalytics,
  capState,
} from "@/lib/server/entitlement-gates";

const withFeatures = (feats: Record<string, boolean>): AccountOverrides => ({
  ...DEFAULT_OVERRIDES,
  entitlementOverrides: feats,
});

const plusArtist = (): AccountOverrides => ({
  ...DEFAULT_OVERRIDES,
  planTier: "plus",
});

const freeArtist = (): AccountOverrides => DEFAULT_OVERRIDES;

beforeEach(() => {
  disabled.mockReset();
  disabled.mockReturnValue(false); // default: nothing paused => enforced
});

describe("GRANT gates (Free denied, Plus allowed, paused = inert)", () => {
  const grants = [
    { name: "brandingRemoved", fn: brandingRemoved, cap: "branding" },
    {
      name: "appearanceCustomAllowed",
      fn: appearanceCustomAllowed,
      cap: "appearance_custom",
    },
    {
      name: "richContentBlocksAllowed",
      fn: richContentBlocksAllowed,
      cap: "rich_content_blocks",
    },
    {
      name: "conditionalQuestionsAllowed",
      fn: conditionalQuestionsAllowed,
      cap: "form_conditional",
    },
    { name: "formCustomAllowed", fn: formCustomAllowed, cap: "form_custom" },
    {
      name: "largeProjectsAllowed",
      fn: largeProjectsAllowed,
      cap: "large_projects",
    },
    {
      name: "goodsDiscountsAllowed",
      fn: goodsDiscountsAllowed,
      cap: "goods_discounts",
    },
    {
      name: "goodsSchedulingAllowed",
      fn: goodsSchedulingAllowed,
      cap: "goods_scheduling",
    },
    {
      name: "goodsCollectionsAllowed",
      fn: goodsCollectionsAllowed,
      cap: "goods_collections",
    },
  ] as const;

  for (const { name, fn, cap } of grants) {
    describe(name, () => {
      it("rejects a Free artist (plan baseline)", () => {
        expect(fn(freeArtist())).toBe(false);
      });

      it("allows a Plus artist (plan baseline)", () => {
        expect(fn(plusArtist())).toBe(true);
      });

      it("paused => false even for Plus (inert)", () => {
        disabled.mockImplementation((c) => c === cap);
        expect(fn(plusArtist())).toBe(false);
      });

      it("explicit override grants access to Free", () => {
        expect(fn(withFeatures({ [cap]: true }))).toBe(true);
      });

      it("explicit override denies access to Plus", () => {
        expect(
          fn({ ...plusArtist(), entitlementOverrides: { [cap]: false } }),
        ).toBe(false);
      });
    });
  }
});

describe("richContentBlocksAllowed (FD1: split off appearance_custom)", () => {
  it("a Free artist gets appearance_custom but NOT rich_content_blocks (the two are independent, no split gating)", () => {
    const withAppearanceOnly: AccountOverrides = {
      ...DEFAULT_OVERRIDES,
      entitlementOverrides: { appearance_custom: true },
    };
    expect(appearanceCustomAllowed(withAppearanceOnly)).toBe(true);
    expect(richContentBlocksAllowed(withAppearanceOnly)).toBe(false);
  });

  it("the legacy_free_v1 grandfather package (custom_templates only) does NOT imply rich_content_blocks", () => {
    // Mirrors computeLegacyFreeV1Grant's actual output shape (entitlements.ts):
    // { features: { custom_templates: true }, limits: {...} } — the grant never
    // touched appearance_custom or rich_content_blocks, so a grandfathered
    // Free artist stays denied on both.
    const grandfathered: AccountOverrides = {
      ...DEFAULT_OVERRIDES,
      policyId: "legacy_free_v1",
      entitlementOverrides: { custom_templates: true },
    };
    expect(canEditTemplates(grandfathered)).toBe(true);
    expect(richContentBlocksAllowed(grandfathered)).toBe(false);
    expect(appearanceCustomAllowed(grandfathered)).toBe(false);
  });
});

describe("canEditTemplates / canSeeAdvancedAnalytics (restriction shape)", () => {
  it("enforced + not entitled => blocked (cannot edit / no advanced)", () => {
    expect(canEditTemplates(withFeatures({ custom_templates: false }))).toBe(
      false,
    );
    expect(canSeeAdvancedAnalytics(withFeatures({ analytics: false }))).toBe(
      false,
    );
  });
  it("enforced + entitled => allowed", () => {
    expect(canEditTemplates(withFeatures({ custom_templates: true }))).toBe(
      true,
    );
    expect(canSeeAdvancedAnalytics(withFeatures({ analytics: true }))).toBe(
      true,
    );
  });
  it("Free artist is blocked by plan baseline", () => {
    expect(canEditTemplates(freeArtist())).toBe(false);
    expect(canSeeAdvancedAnalytics(freeArtist())).toBe(false);
  });
  it("Plus artist is allowed by plan baseline", () => {
    expect(canEditTemplates(plusArtist())).toBe(true);
    expect(canSeeAdvancedAnalytics(plusArtist())).toBe(true);
  });
  it("paused => allowed for everyone (inert)", () => {
    disabled.mockReturnValue(true);
    expect(canEditTemplates(freeArtist())).toBe(true);
    expect(canSeeAdvancedAnalytics(freeArtist())).toBe(true);
  });
});

describe("capState (numeric cap, block-new)", () => {
  it("enforced + at the free cap => blocked", () => {
    const s = capState(DEFAULT_OVERRIDES, "custom_fields", 3); // free cap 3
    expect(s.blocked).toBe(true);
    expect(s.cap).toBe(3);
  });
  it("enforced + under the cap => not blocked", () => {
    expect(capState(DEFAULT_OVERRIDES, "custom_fields", 2).blocked).toBe(false);
  });
  it("Plus artist has a higher cap and is not blocked at the Free cap", () => {
    expect(capState(plusArtist(), "custom_fields", 3).blocked).toBe(false);
  });
  it("Plus artist is blocked at the Plus cap", () => {
    const s = capState(plusArtist(), "custom_fields", 30);
    expect(s.blocked).toBe(true);
    expect(s.cap).toBe(30);
  });
  it("paused => never blocked, even over the cap (inert)", () => {
    disabled.mockReturnValue(true);
    expect(capState(DEFAULT_OVERRIDES, "custom_fields", 99).blocked).toBe(
      false,
    );
  });
  it("a per-account unlimited override never blocks", () => {
    const unlimited: AccountOverrides = {
      ...DEFAULT_OVERRIDES,
      limitOverrides: { custom_fields: null },
    };
    expect(capState(unlimited, "custom_fields", 999).blocked).toBe(false);
    expect(capState(unlimited, "custom_fields", 999).cap).toBeNull();
  });
  it("a per-account numeric override raises the cap", () => {
    const raised: AccountOverrides = {
      ...DEFAULT_OVERRIDES,
      limitOverrides: { custom_fields: 50 },
    };
    expect(capState(raised, "custom_fields", 49).blocked).toBe(false);
    expect(capState(raised, "custom_fields", 50).blocked).toBe(true);
    expect(capState(raised, "custom_fields", 50).cap).toBe(50);
  });
});
