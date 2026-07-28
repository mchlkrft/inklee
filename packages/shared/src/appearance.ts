// The SHARED APPEARANCE SYSTEM (Plus build P1, the keystone).
//
// One per-artist appearance configuration consumed by every public surface:
// the Inklee Hub, the public artist page, the primary booking form, the
// large-project intake, the goods shop, and the guest-spot surfaces. Global
// defaults with optional per-surface overrides, so appearance is never
// configured independently per feature (plus-product-spec.md section 8).
//
// Stored in `profiles.settings.appearance` JSONB, the same family as
// bio_page / books_settings / deposit_defaults: no migration, one shared
// parser serving the web render, the web editor, and the native editor
// through one mobile route, with legacy read-through so existing data needs
// no backfill.
//
// LEGACY READ-THROUGH (load-bearing): two appearance fragments predate this
// system and remain the live truth for existing artists.
//   - `settings.cover_color` + `settings.cover_image_url` (free tier, live)
//   - `settings.books_settings.form_appearance` (written since the booking
//     settings work, never read: the public page hardcodes light)
// `parseAppearance` synthesizes an appearance from them when no explicit
// appearance object exists, so nothing changes visually for anyone until an
// artist sets something. The new shape is written back on the next save.
//
// This module is PURE: no React, no DOM, no server imports. The CSS custom
// properties it emits are consumed by the existing `[data-appearance]` token
// scoping in globals.css, which already re-maps semantic tokens per wrapper.

import { sanitizeCoverColor } from "./cover-colors";

// ---------------------------------------------------------------------------
// Theme: the base light/dark/auto choice. These three values are exactly the
// ones `form_appearance` already stores and `[data-appearance]` already
// implements, so the legacy value maps across with no translation.

export const APPEARANCE_THEMES = ["light", "dark", "auto"] as const;
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];

export function isAppearanceTheme(v: unknown): v is AppearanceTheme {
  return (
    typeof v === "string" &&
    (APPEARANCE_THEMES as readonly string[]).includes(v)
  );
}

// ---------------------------------------------------------------------------
// Typography: a CURATED library, never arbitrary uploads (spec section 4).
// Each entry names a family the app ships or safely falls back to; the stack
// is what actually reaches CSS, so a missing font degrades to a real system
// face rather than a blank render. Adding a face means adding its assets AND
// a row here; nothing loads fonts at build time from a remote host.

export type AppearanceFontId = "inklee" | "grotesk" | "serif" | "mono";

export const APPEARANCE_FONTS: ReadonlyArray<{
  id: AppearanceFontId;
  label: string;
  /** The CSS font stack emitted for this choice. */
  stack: string;
}> = [
  {
    id: "inklee",
    label: "Inklee",
    stack: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "grotesk",
    label: "Grotesk",
    stack:
      "ui-sans-serif, 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif",
  },
  {
    id: "serif",
    label: "Serif",
    stack: "ui-serif, Georgia, 'Times New Roman', serif",
  },
  {
    id: "mono",
    label: "Mono",
    stack: "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace",
  },
];

const FONT_IDS: ReadonlySet<string> = new Set(APPEARANCE_FONTS.map((f) => f.id));

export function isAppearanceFontId(v: unknown): v is AppearanceFontId {
  return typeof v === "string" && FONT_IDS.has(v);
}

export function fontStackFor(id: AppearanceFontId): string {
  return (
    APPEARANCE_FONTS.find((f) => f.id === id)?.stack ??
    APPEARANCE_FONTS[0].stack
  );
}

// ---------------------------------------------------------------------------
// Buttons: a small closed set of treatments. Deliberately not free-form CSS:
// the artist picks a shape, the tokens do the rest, and no stored value can
// inject styles into a public page.

export const BUTTON_TREATMENTS = ["solid", "outline", "soft"] as const;
export type ButtonTreatment = (typeof BUTTON_TREATMENTS)[number];

export function isButtonTreatment(v: unknown): v is ButtonTreatment {
  return (
    typeof v === "string" && (BUTTON_TREATMENTS as readonly string[]).includes(v)
  );
}

export const BUTTON_RADII = ["sharp", "soft", "round"] as const;
export type ButtonRadius = (typeof BUTTON_RADII)[number];

export function isButtonRadius(v: unknown): v is ButtonRadius {
  return typeof v === "string" && (BUTTON_RADII as readonly string[]).includes(v);
}

const RADIUS_CSS: Record<ButtonRadius, string> = {
  sharp: "0.25rem",
  soft: "0.5rem",
  round: "9999px",
};

// ---------------------------------------------------------------------------
// Layout templates (Plus build P2). The four confirmed initial templates
// (plus-product-spec.md section 3). "clean" is the Free layout and the
// default: a Free artist's page keeps a professionally designed default
// experience, and the spec's rule that the Free page is never deliberately
// made poor is enforced by that default being a real template, not a
// stripped one.

export const PAGE_TEMPLATES = [
  "clean",
  "portfolio",
  "bold",
  "editorial",
] as const;
export type PageTemplate = (typeof PAGE_TEMPLATES)[number];

export const PAGE_TEMPLATE_META: Record<
  PageTemplate,
  { label: string; description: string }
> = {
  clean: {
    label: "Clean",
    description: "Calm and centred. The default.",
  },
  portfolio: {
    label: "Portfolio",
    description: "Bigger imagery, work first.",
  },
  bold: {
    label: "Bold",
    description: "Large type, high contrast.",
  },
  editorial: {
    label: "Editorial",
    description: "Left-aligned, magazine feel.",
  },
};

export function isPageTemplate(v: unknown): v is PageTemplate {
  return (
    typeof v === "string" && (PAGE_TEMPLATES as readonly string[]).includes(v)
  );
}

// ---------------------------------------------------------------------------
// The surfaces that may override the global appearance. Adding a surface here
// is the whole cost of putting it on the system.

export const APPEARANCE_SURFACES = [
  "hub",
  "bookingForm",
  "largeProject",
  "shop",
  "guestSpots",
] as const;
export type AppearanceSurface = (typeof APPEARANCE_SURFACES)[number];

export function isAppearanceSurface(v: unknown): v is AppearanceSurface {
  return (
    typeof v === "string" &&
    (APPEARANCE_SURFACES as readonly string[]).includes(v)
  );
}

// ---------------------------------------------------------------------------
// The model.

/** The properties a surface may override. Every field optional: an override
 *  declares ONLY what it changes, and everything else inherits the global. */
export type AppearanceOverride = {
  theme?: AppearanceTheme;
  template?: PageTemplate;
  accent?: string | null;
  font?: AppearanceFontId;
  buttonTreatment?: ButtonTreatment;
  buttonRadius?: ButtonRadius;
  backgroundImageUrl?: string | null;
};

/** The resolved, complete appearance for one surface. */
export type ResolvedAppearance = {
  theme: AppearanceTheme;
  template: PageTemplate;
  /** Brand swatch id or #hex; null = the Inklee default accent. */
  accent: string | null;
  font: AppearanceFontId;
  buttonTreatment: ButtonTreatment;
  buttonRadius: ButtonRadius;
  backgroundImageUrl: string | null;
};

/** The stored per-artist configuration: a global appearance plus overrides. */
export type AppearanceSettings = {
  global: ResolvedAppearance;
  surfaces: Partial<Record<AppearanceSurface, AppearanceOverride>>;
};

export const DEFAULT_APPEARANCE: ResolvedAppearance = {
  // Light matches what every public surface renders today (the booking page
  // hardcodes data-appearance="light"), so the default is a no-op visually.
  theme: "light",
  template: "clean",
  accent: null,
  font: "inklee",
  buttonTreatment: "solid",
  buttonRadius: "soft",
  backgroundImageUrl: null,
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  global: { ...DEFAULT_APPEARANCE },
  surfaces: {},
};

// ---------------------------------------------------------------------------
// Parsing.

function parseUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  // Only absolute http(s) URLs reach a public page (the image pipeline stores
  // these); anything else, including javascript: and data:, is dropped.
  if (!/^https?:\/\//i.test(s)) return null;
  return s.slice(0, 2048);
}

function parseResolved(
  raw: unknown,
  base: ResolvedAppearance,
): ResolvedAppearance {
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as Record<string, unknown>;
  return {
    theme: isAppearanceTheme(o.theme) ? o.theme : base.theme,
    template: isPageTemplate(o.template) ? o.template : base.template,
    accent: "accent" in o ? sanitizeCoverColor(o.accent) : base.accent,
    font: isAppearanceFontId(o.font) ? o.font : base.font,
    buttonTreatment: isButtonTreatment(o.buttonTreatment)
      ? o.buttonTreatment
      : base.buttonTreatment,
    buttonRadius: isButtonRadius(o.buttonRadius)
      ? o.buttonRadius
      : base.buttonRadius,
    backgroundImageUrl:
      "backgroundImageUrl" in o
        ? parseUrl(o.backgroundImageUrl)
        : base.backgroundImageUrl,
  };
}

function parseOverride(raw: unknown): AppearanceOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: AppearanceOverride = {};
  if (isAppearanceTheme(o.theme)) out.theme = o.theme;
  if (isPageTemplate(o.template)) out.template = o.template;
  if ("accent" in o) out.accent = sanitizeCoverColor(o.accent);
  if (isAppearanceFontId(o.font)) out.font = o.font;
  if (isButtonTreatment(o.buttonTreatment))
    out.buttonTreatment = o.buttonTreatment;
  if (isButtonRadius(o.buttonRadius)) out.buttonRadius = o.buttonRadius;
  if ("backgroundImageUrl" in o)
    out.backgroundImageUrl = parseUrl(o.backgroundImageUrl);
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Parse `profiles.settings` into appearance settings.
 *
 * Takes the WHOLE settings object, not just `settings.appearance`, because the
 * legacy read-through needs the sibling fields (`cover_color`,
 * `cover_image_url`, `books_settings.form_appearance`). Never throws; anything
 * unrecognised falls back to the default, exactly like parseBioPageSettings.
 */
export function parseAppearance(settings: unknown): AppearanceSettings {
  const root =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>)
      : {};

  // Legacy fragments become the BASE, so an artist who never touches the new
  // editor keeps exactly the appearance they have today.
  const legacyAccent = sanitizeCoverColor(root.cover_color);
  const legacyBackground = parseUrl(root.cover_image_url);
  const legacyBooks =
    root.books_settings && typeof root.books_settings === "object"
      ? (root.books_settings as Record<string, unknown>)
      : {};
  const legacyTheme = isAppearanceTheme(legacyBooks.form_appearance)
    ? legacyBooks.form_appearance
    : DEFAULT_APPEARANCE.theme;

  const base: ResolvedAppearance = {
    ...DEFAULT_APPEARANCE,
    theme: legacyTheme,
    accent: legacyAccent,
    backgroundImageUrl: legacyBackground,
  };

  const raw = root.appearance;
  if (!raw || typeof raw !== "object") {
    return { global: base, surfaces: {} };
  }
  const o = raw as Record<string, unknown>;

  const global = parseResolved(o.global, base);

  const surfaces: Partial<Record<AppearanceSurface, AppearanceOverride>> = {};
  const rawSurfaces =
    o.surfaces && typeof o.surfaces === "object"
      ? (o.surfaces as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(rawSurfaces)) {
    if (!isAppearanceSurface(key)) continue;
    const parsed = parseOverride(value);
    if (parsed) surfaces[key] = parsed;
  }

  return { global, surfaces };
}

/** The effective appearance for one surface: global with its override applied. */
export function resolveAppearance(
  settings: AppearanceSettings,
  surface: AppearanceSurface,
): ResolvedAppearance {
  const override = settings.surfaces[surface];
  if (!override) return { ...settings.global };
  return {
    theme: override.theme ?? settings.global.theme,
    template: override.template ?? settings.global.template,
    accent:
      override.accent !== undefined ? override.accent : settings.global.accent,
    font: override.font ?? settings.global.font,
    buttonTreatment:
      override.buttonTreatment ?? settings.global.buttonTreatment,
    buttonRadius: override.buttonRadius ?? settings.global.buttonRadius,
    backgroundImageUrl:
      override.backgroundImageUrl !== undefined
        ? override.backgroundImageUrl
        : settings.global.backgroundImageUrl,
  };
}

// ---------------------------------------------------------------------------
// Rendering.

/** The accent hex for a stored accent value (swatch id or raw hex). */
export function accentHex(
  accent: string | null,
  swatches: ReadonlyArray<{ id: string; hex: string }>,
): string | null {
  if (!accent) return null;
  if (accent.startsWith("#")) return accent;
  return swatches.find((s) => s.id === accent)?.hex ?? null;
}

/**
 * The CSS custom properties for a resolved appearance, to spread onto the
 * wrapper element that already carries `data-appearance={theme}`.
 *
 * Only emits a property when the artist actually chose something, so a default
 * appearance produces an EMPTY object and the surface renders byte-identically
 * to today. That property is what makes this safe to wire everywhere before
 * any editor exists.
 */
export function appearanceCssVars(
  a: ResolvedAppearance,
  swatches: ReadonlyArray<{ id: string; hex: string }>,
): Record<string, string> {
  const vars: Record<string, string> = {};

  const hex = accentHex(a.accent, swatches);
  if (hex) vars["--appearance-accent"] = hex;

  if (a.font !== DEFAULT_APPEARANCE.font) {
    vars["--appearance-font"] = fontStackFor(a.font);
  }
  if (a.buttonRadius !== DEFAULT_APPEARANCE.buttonRadius) {
    vars["--appearance-button-radius"] = RADIUS_CSS[a.buttonRadius];
  }
  return vars;
}
