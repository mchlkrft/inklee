/** @type {import('tailwindcss').Config} */
// Brand tokens mirror apps/web globals.css (mustard/rosa/charcoal/bone + states).
module.exports = {
  content: ["./app/**/*.{js,ts,tsx}", "./src/**/*.{js,ts,tsx}"],
  presets: [require("nativewind/preset")],
  // MB-12: class-based dark mode. The ThemeProvider (src/lib/theme.tsx) flips the
  // active color scheme via NativeWind, which toggles the `.dark` selector that
  // re-binds the CSS variables defined in global.css.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand atoms — theme-INDEPENDENT (identical in light + dark).
        mustard: "#e9b22b",
        rosa: "#db88b9",
        charcoal: "#1e1e1e",
        bone: "#e5e1d5",
        cobalt: "#0b3d9f",
        danger: "#cf2e2c",
        success: "#105f2d",
        // Semantic tokens — resolve to the CSS variables in global.css, so every
        // `bg-background`/`text-foreground`/`border-border`/… follows the theme.
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-elevated": "var(--card-elevated)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        "subtle-foreground": "var(--subtle-foreground)",
        border: "var(--border)",
        hover: "var(--hover)",
        glass: "var(--glass)",
        chrome: "var(--chrome)",
        // Back-compat: the original dark-only `shell.*` scale now points at the
        // theme variables, so every existing `text-shell-dim`/`border-shell-border`
        // class themes automatically without a code change.
        shell: {
          bg: "var(--background)",
          fg: "var(--foreground)",
          dim: "var(--muted-foreground)",
          mute: "var(--subtle-foreground)",
          border: "var(--border)",
          hover: "var(--hover)",
          hoverStrong: "var(--hover-strong)",
        },
      },
      // The signature 1.5px border motif (plan §3.3). Use `border-brand` on every
      // Inklee surface; `border-hairline` for incidental dividers.
      borderWidth: {
        hairline: "1px",
        brand: "1.5px",
      },
      // Card corner radius (plan §3.4): `rounded-card` = web rounded-[20px].
      borderRadius: {
        card: "20px",
      },
      // Named spacing rhythm (plan §3.4) alongside the default numeric scale.
      // `13` (52px) is the standard button height (h-13) — 13 is absent from
      // the default Tailwind scale, so it must be declared or NativeWind drops
      // the class silently. Keep in sync with control in src/lib/tokens.ts.
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        "2xl": "32px",
        13: "52px",
      },
      // Named type scale (plan §3.2): text-display / text-title / … carry size +
      // line-height; weight is applied via font-* classes in the primitives.
      fontSize: {
        display: ["28px", { lineHeight: "34px", letterSpacing: "-0.2px" }],
        title: ["20px", { lineHeight: "25px" }],
        subtitle: ["16px", { lineHeight: "22px" }],
        body: ["16px", { lineHeight: "24px" }],
        label: ["13px", { lineHeight: "16px" }],
        caption: ["12px", { lineHeight: "16px" }],
        overline: ["11px", { lineHeight: "13px", letterSpacing: "1.4px" }],
      },
    },
  },
  plugins: [],
};
