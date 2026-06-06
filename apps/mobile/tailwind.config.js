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
        },
      },
    },
  },
  plugins: [],
};
