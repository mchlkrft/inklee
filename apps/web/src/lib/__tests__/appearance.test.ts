import { describe, it, expect } from "vitest";
import {
  parseAppearance,
  resolveAppearance,
  appearanceCssVars,
  DEFAULT_APPEARANCE,
  APPEARANCE_FONTS,
  fontStackFor,
  PAGE_TEMPLATES,
  PAGE_TEMPLATE_META,
} from "@inklee/shared/appearance";
import { templateStyles } from "@inklee/shared/page-template-styles";
import { COVER_COLORS } from "@inklee/shared/cover-colors";

// The shared appearance system's contract (Plus build P1). The load-bearing
// guarantees: legacy read-through so nothing changes for existing artists,
// per-surface override precedence, and an EMPTY css-var emission when nothing
// was customized (which is what makes wiring surfaces safe before any editor
// exists).

describe("parseAppearance: legacy read-through", () => {
  it("synthesizes an appearance from the legacy cover fields", () => {
    const a = parseAppearance({
      cover_color: "mustard",
      cover_image_url: "https://cdn.example/cover.webp",
    });
    expect(a.global.accent).toBe("mustard");
    expect(a.global.backgroundImageUrl).toBe("https://cdn.example/cover.webp");
    expect(a.surfaces).toEqual({});
  });

  it("reads the dormant books_settings.form_appearance as the theme", () => {
    // Written since the booking-settings work but never read (the public page
    // hardcodes light). The appearance system is where it finally lands.
    const a = parseAppearance({ books_settings: { form_appearance: "dark" } });
    expect(a.global.theme).toBe("dark");
  });

  it("returns defaults for empty, null, and junk settings", () => {
    for (const input of [undefined, null, 42, "x", {}, { appearance: 7 }]) {
      expect(parseAppearance(input).global).toEqual(DEFAULT_APPEARANCE);
    }
  });

  it("lets an explicit appearance override the legacy fields", () => {
    const a = parseAppearance({
      cover_color: "mustard",
      appearance: { global: { accent: "cobalt", font: "serif" } },
    });
    expect(a.global.accent).toBe("cobalt");
    expect(a.global.font).toBe("serif");
  });

  it("keeps a legacy field the explicit appearance does not mention", () => {
    const a = parseAppearance({
      cover_image_url: "https://cdn.example/cover.webp",
      appearance: { global: { font: "mono" } },
    });
    expect(a.global.font).toBe("mono");
    expect(a.global.backgroundImageUrl).toBe("https://cdn.example/cover.webp");
  });
});

describe("parseAppearance: hostile input", () => {
  it("drops non-http background URLs", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html;base64,x",
      "/relative.png",
      "",
    ]) {
      const a = parseAppearance({
        appearance: { global: { backgroundImageUrl: bad } },
      });
      expect(a.global.backgroundImageUrl).toBeNull();
    }
  });

  it("drops unknown fonts, treatments, radii, themes and accents", () => {
    const a = parseAppearance({
      appearance: {
        global: {
          theme: "neon",
          font: "comic",
          buttonTreatment: "explode",
          buttonRadius: "huge",
          accent: "rgb(1,2,3)",
        },
      },
    });
    expect(a.global).toEqual(DEFAULT_APPEARANCE);
  });

  it("ignores unknown surface keys", () => {
    const a = parseAppearance({
      appearance: {
        surfaces: { hub: { font: "mono" }, nope: { font: "serif" } },
      },
    });
    expect(Object.keys(a.surfaces)).toEqual(["hub"]);
  });
});

describe("resolveAppearance: per-surface precedence", () => {
  const settings = parseAppearance({
    appearance: {
      global: { font: "serif", accent: "cobalt", buttonRadius: "round" },
      surfaces: { hub: { font: "mono" }, shop: { accent: null } },
    },
  });

  it("inherits the global where a surface declares nothing", () => {
    const shop = resolveAppearance(settings, "shop");
    expect(shop.font).toBe("serif");
    expect(shop.buttonRadius).toBe("round");
  });

  it("applies the surface override where it declares one", () => {
    expect(resolveAppearance(settings, "hub").font).toBe("mono");
    // ...without disturbing the rest.
    expect(resolveAppearance(settings, "hub").accent).toBe("cobalt");
  });

  it("honours an explicit null override (clearing, not inheriting)", () => {
    // The distinction that makes overrides usable: shop explicitly clears the
    // accent, which must NOT fall back to the global's cobalt.
    expect(resolveAppearance(settings, "shop").accent).toBeNull();
  });

  it("returns the global untouched for a surface with no entry", () => {
    expect(resolveAppearance(settings, "bookingForm")).toEqual(settings.global);
  });
});

describe("appearanceCssVars", () => {
  it("emits NOTHING for a default appearance (surfaces stay byte-identical)", () => {
    expect(appearanceCssVars(DEFAULT_APPEARANCE, COVER_COLORS)).toEqual({});
  });

  it("resolves a swatch id to its brand hex", () => {
    const vars = appearanceCssVars(
      { ...DEFAULT_APPEARANCE, accent: "mustard" },
      COVER_COLORS,
    );
    expect(vars["--appearance-accent"]).toBe("#e9b22b");
  });

  it("passes a raw hex accent through", () => {
    const vars = appearanceCssVars(
      { ...DEFAULT_APPEARANCE, accent: "#123456" },
      COVER_COLORS,
    );
    expect(vars["--appearance-accent"]).toBe("#123456");
  });

  it("emits a font stack only for a non-default font", () => {
    expect(
      appearanceCssVars(
        { ...DEFAULT_APPEARANCE, font: "inklee" },
        COVER_COLORS,
      ),
    ).not.toHaveProperty("--appearance-font");
    expect(
      appearanceCssVars({ ...DEFAULT_APPEARANCE, font: "mono" }, COVER_COLORS)[
        "--appearance-font"
      ],
    ).toBe(fontStackFor("mono"));
  });

  it("never emits a bare font family (every stack has a fallback)", () => {
    // A missing curated face must degrade to a real system face, never to a
    // blank render on a public page.
    for (const f of APPEARANCE_FONTS) {
      expect(f.stack.split(",").length).toBeGreaterThan(1);
    }
  });
});

describe("layout templates (P2)", () => {
  it("defaults to clean, which IS the pre-template hub layout", () => {
    expect(DEFAULT_APPEARANCE.template).toBe("clean");
    // The default template must be a REAL designed layout, not a stripped
    // one: the spec forbids deliberately making the Free page poor.
    expect(templateStyles("clean").main).toContain("max-w-md");
    expect(templateStyles("clean").centered).toBe(true);
  });

  it("every template supplies every style slot", () => {
    for (const id of PAGE_TEMPLATES) {
      const s = templateStyles(id);
      for (const [slot, value] of Object.entries(s)) {
        if (slot === "centered") continue;
        expect(String(value).length, `${id}.${slot}`).toBeGreaterThan(0);
      }
    }
  });

  it("every template has editor-facing copy", () => {
    for (const id of PAGE_TEMPLATES) {
      expect(PAGE_TEMPLATE_META[id].label.length).toBeGreaterThan(0);
      expect(PAGE_TEMPLATE_META[id].description.length).toBeGreaterThan(0);
      // Copy rules: sentence case, no em-dashes.
      expect(PAGE_TEMPLATE_META[id].description).not.toContain("—");
    }
  });

  it("parses a template and rejects an unknown one", () => {
    expect(
      parseAppearance({ appearance: { global: { template: "bold" } } }).global
        .template,
    ).toBe("bold");
    expect(
      parseAppearance({ appearance: { global: { template: "neon" } } }).global
        .template,
    ).toBe("clean");
  });

  it("resolves a per-surface template override", () => {
    const s = parseAppearance({
      appearance: {
        global: { template: "bold" },
        surfaces: { hub: { template: "editorial" } },
      },
    });
    expect(resolveAppearance(s, "hub").template).toBe("editorial");
    expect(resolveAppearance(s, "bookingForm").template).toBe("bold");
  });

  it("falls back to clean for an unknown template id at render time", () => {
    // Defensive: a value that somehow bypasses the parser must not blank a page.
    expect(templateStyles("nope" as never)).toEqual(templateStyles("clean"));
  });
});
