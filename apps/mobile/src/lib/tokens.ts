// JS mirror of the apps/web globals.css brand palette, for places that need raw
// color values (navigation theming, status bar, icons) rather than NativeWind
// classes. Keep in sync with tailwind.config.js.
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
  },
} as const;
