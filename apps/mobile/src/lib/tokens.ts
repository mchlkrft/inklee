// JS mirror of the apps/web globals.css brand system, for places that need raw
// values (navigation theming, status bar, icons, primitives that map a role to a
// color) rather than NativeWind classes. Keep in sync with tailwind.config.js.
//
// Slice MB-1 (docs/mobile-web-alignment-plan.md §3): extended with the semantic
// roles, named type scale, spacing rhythm, and the 1.5px-border / 20px-radius
// motif so the mobile app can carry the web's "Inklee character" at the system
// layer. Mobile stays dark-shell-dominant (charcoal bg, bone fg) — we do NOT
// port the web's bone "workspace" surface (§3.1, a deliberate native divergence).
export const colors = {
  mustard: "#e9b22b",
  rosa: "#db88b9",
  cobalt: "#0b3d9f",
  danger: "#cf2e2c",
  success: "#105f2d",
  charcoal: "#1e1e1e",
  bone: "#e5e1d5",
  shell: {
    bg: "#1e1e1e",
    fg: "#e5e1d5",
    dim: "rgba(229,225,213,0.55)",
    mute: "rgba(229,225,213,0.32)",
    border: "rgba(229,225,213,0.18)",
    // Press / hover wash on dark surfaces (web has hover states; native uses
    // these for pressed affordances).
    hover: "rgba(229,225,213,0.12)",
    hoverStrong: "rgba(229,225,213,0.20)",
  },
} as const;

// Icon-chip / accent tints (§3.5) — solid brand fills with the icon foreground
// that reads on them. Mirrors the web IconChip TINT_CLASSES. Consumed by the
// IconChip primitive (MB-3).
export const tint = {
  mustard: { bg: colors.mustard, fg: colors.charcoal },
  rosa: { bg: colors.rosa, fg: colors.charcoal },
  cobalt: { bg: colors.cobalt, fg: colors.bone },
  red: { bg: colors.danger, fg: colors.bone },
  green: { bg: colors.success, fg: colors.bone },
  bone: { bg: colors.charcoal, fg: colors.bone }, // inverted neutral
} as const;

export type TintRole = keyof typeof tint;

// Named type scale (§3.2) — a restrained, weight-driven hierarchy mirroring the
// web. Sizes are also exposed as NativeWind fontSize tokens (text-display,
// text-title, …) in tailwind.config.js; this export is for primitives that set
// values directly (e.g. via style props) and as the single source for weights.
export const type = {
  display: { fontSize: 28, fontWeight: "700", lineHeight: 34 },
  title: { fontSize: 20, fontWeight: "600", lineHeight: 25 },
  subtitle: { fontSize: 16, fontWeight: "500", lineHeight: 22 },
  body: { fontSize: 16, fontWeight: "400", lineHeight: 24 },
  label: { fontSize: 13, fontWeight: "600", lineHeight: 16 },
  caption: { fontSize: 12, fontWeight: "400", lineHeight: 16 },
  overline: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 13,
    letterSpacing: 1.4,
  },
} as const;

export type TypeRole = keyof typeof type;

// Spacing rhythm (§3.4) — the web's space-y-6 / gap-3 cadence, named so
// primitives don't scatter ad-hoc values. Mirrored in tailwind `spacing`.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
} as const;

// Corner radius (§3.4): cards 20 (web rounded-[20px]); pill = fully rounded
// buttons/chips (web rounded-full).
export const radius = {
  card: 20,
  pill: 9999,
} as const;

// Control heights (founder round 4 button sweep): one scale for every
// button-shaped control. md is the full-width CTA default; sm covers inline
// row actions (>= Apple's 44pt minimum); icon sizes are the circular
// icon-button diameters. Raw values for native style props (e.g. the Apple
// auth button); the className mirror is h-9/h-11/h-13/h-14 + h-10/h-11
// (tailwind.config.js declares the non-default `13`).
export const control = {
  xs: 36,
  sm: 44,
  md: 52,
  lg: 56,
  iconSm: 40,
  iconMd: 44,
} as const;

// The signature 1.5px border motif (§3.3). Web overrides every border to 1.5px;
// RN can't do a global override, so Inklee primitives use `border.brand`
// explicitly. `hairline` is the default 1px for incidental dividers.
export const border = {
  hairline: 1,
  brand: 1.5,
} as const;
