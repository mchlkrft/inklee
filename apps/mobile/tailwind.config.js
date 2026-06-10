/** @type {import('tailwindcss').Config} */
// Brand tokens mirror apps/web globals.css (mustard/rosa/charcoal/bone + states).
module.exports = {
  content: ["./app/**/*.{js,ts,tsx}", "./src/**/*.{js,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        mustard: "#e9b22b",
        rosa: "#db88b9",
        charcoal: "#1e1e1e",
        bone: "#e5e1d5",
        cobalt: "#0b3d9f",
        danger: "#cf2e2c",
        success: "#105f2d",
        shell: {
          bg: "#1e1e1e",
          fg: "#e5e1d5",
          dim: "rgba(229,225,213,0.55)",
          mute: "rgba(229,225,213,0.32)",
          border: "rgba(229,225,213,0.18)",
          hover: "rgba(229,225,213,0.12)",
          hoverStrong: "rgba(229,225,213,0.20)",
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
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        "2xl": "32px",
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
