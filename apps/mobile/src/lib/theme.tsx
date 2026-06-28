import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { vars } from "nativewind";

// MB-12/13 runtime theme. IMPORTANT: NativeWind on React Native has NO cascading
// `.dark` root class like the web, so theming via `:root { --x }` + `.dark { --x }`
// in global.css does NOT switch at runtime (only :root ever applies). The working
// pattern is NativeWind's `vars()`: set the CSS variables as an inline style on a
// wrapper View whose value we swap by scheme. Descendant `bg-background` /
// `text-foreground` / ... classes (which resolve to `var(--…)` in tailwind.config)
// then follow the theme, and the toggle works. Inline-style consumers read the same
// scheme from this Context via useThemeColors()/useColors().

export type ThemePreference = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

const STORAGE_KEY = "inklee.theme-preference";

type Palette = {
  background: string;
  foreground: string;
  card: string;
  cardElevated: string;
  muted: string;
  mutedForeground: string;
  subtleForeground: string;
  border: string;
  hover: string;
  hoverStrong: string;
  glass: string;
  // Opaque elevated chrome (nav/top-bar pill). Opaque so Android `elevation`
  // casts a clean shadow instead of a solid-black artifact on a translucent bg.
  chrome: string;
  // Readable accent for TEXT / ICONS / BORDERS on themed surfaces (founder
  // round 5: mustard text on bone is unreadable). Mustard in dark; a darkened
  // ochre in light that passes 4.5:1 on bone, card AND card-elevated. Solid
  // fills keep bg-mustard + text-charcoal (charcoal on dark ochre would fail).
  accent: string;
  // Readable success/danger for TEXT / ICONS on themed surfaces (ME-4: the
  // theme-independent brand greens/reds fail contrast as text — success
  // #105f2d is ~2:1 on the dark shell, danger #cf2e2c ~3.3:1). Fills and
  // washes (bg-success/15, Button's bg-danger, Switch tracks) keep the
  // literal brand atoms.
  successFg: string;
  dangerFg: string;
};

export const palettes: Record<Scheme, Palette> = {
  light: {
    background: "#e5e1d5",
    foreground: "#1e1e1e",
    card: "#d9d4c7",
    cardElevated: "#cdc7b6",
    muted: "#d9d4c7",
    mutedForeground: "rgba(30,30,30,0.6)",
    subtleForeground: "rgba(30,30,30,0.4)",
    border: "rgba(30,30,30,0.18)",
    hover: "rgba(30,30,30,0.06)",
    hoverStrong: "rgba(30,30,30,0.1)",
    glass: "rgba(30,30,30,0.05)",
    chrome: "#ece8dd",
    accent: "#6b4e00",
    successFg: "#105f2d",
    dangerFg: "#a61f1d",
  },
  dark: {
    background: "#1e1e1e",
    foreground: "#e5e1d5",
    card: "#252525",
    cardElevated: "#2d2d2d",
    muted: "#252525",
    mutedForeground: "rgba(229,225,213,0.55)",
    subtleForeground: "rgba(229,225,213,0.32)",
    border: "rgba(229,225,213,0.18)",
    hover: "rgba(229,225,213,0.12)",
    hoverStrong: "rgba(229,225,213,0.2)",
    glass: "rgba(229,225,213,0.04)",
    chrome: "#2a2a2a",
    accent: "#e9b22b",
    successFg: "#3fae71",
    dangerFg: "#e8706e",
  },
};

// CSS-variable style objects for the wrapper View — keep names in sync with the
// semantic colors in tailwind.config.js.
const toVars = (p: Palette) =>
  vars({
    "--background": p.background,
    "--foreground": p.foreground,
    "--card": p.card,
    "--card-elevated": p.cardElevated,
    "--muted": p.muted,
    "--muted-foreground": p.mutedForeground,
    "--subtle-foreground": p.subtleForeground,
    "--border": p.border,
    "--hover": p.hover,
    "--hover-strong": p.hoverStrong,
    "--glass": p.glass,
    "--chrome": p.chrome,
    "--accent": p.accent,
    "--success-fg": p.successFg,
    "--danger-fg": p.dangerFg,
  });

// Exported so portalled trees (RN Modal) can re-establish the CSS vars: a Modal
// renders OUTSIDE the ThemeProvider wrapper View, so without re-applying these the
// className `var(--…)` tokens fall back to global.css :root (always dark). Wrap the
// modal root in `<View style={themeVars[scheme]}>` to keep it light/dark aware.
export const themeVars: Record<Scheme, ReturnType<typeof vars>> = {
  light: toVars(palettes.light),
  dark: toVars(palettes.dark),
};

// Brand atoms — identical in both themes.
const BRAND = {
  mustard: "#e9b22b",
  rosa: "#db88b9",
  cobalt: "#0b3d9f",
  danger: "#cf2e2c",
  success: "#105f2d",
  charcoal: "#1e1e1e",
} as const;

// The nav/top-bar chrome is a FIXED dark shell in BOTH themes, mirroring the web's
// two-tone design (a dark shell around a light bone workspace). The content flips
// light/dark; the floating nav pills stay dark with bone text/icons either way.
export const chrome = {
  bg: "#2a2a2a", // pill fill (slightly elevated off charcoal)
  border: "rgba(229,225,213,0.18)",
  fg: "#e5e1d5", // bone text / icons
  mutedFg: "rgba(229,225,213,0.55)",
  subtleFg: "rgba(229,225,213,0.32)",
  hover: "rgba(229,225,213,0.10)", // inner chip wash (books pill)
} as const;

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  scheme: Scheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemScheme, setSystemScheme] = useState<Scheme>(
    Appearance.getColorScheme() === "dark" ? "dark" : "light",
  );

  // Track the OS appearance so "system" stays live.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === "dark" ? "dark" : "light");
    });
    return () => sub.remove();
  }, []);

  // Hydrate the saved preference once.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (active && (v === "light" || v === "dark" || v === "system")) {
        setPreferenceState(v);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    void AsyncStorage.setItem(STORAGE_KEY, p);
  };

  const scheme: Scheme = preference === "system" ? systemScheme : preference;

  const value = useMemo(
    () => ({ preference, setPreference, scheme }),
    [preference, scheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={themeVars[scheme]} className="flex-1">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

/** Founder-facing preference + resolved scheme. Used by the Settings toggle. */
export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemePreference must be used within a ThemeProvider");
  }
  return ctx;
}

/** Resolved palette for inline-style (non-className) consumers — the chrome. */
export function useThemeColors(): Palette {
  return palettes[useThemePreference().scheme];
}

// Theme-aware drop-in for the old static `colors` token (src/lib/tokens.ts).
// Same shape, so an inline-color consumer migrates by swapping the import and
// adding `const colors = useColors()` — every `colors.bone` / `colors.shell.dim`
// reference then follows the theme. Neutral roles flip (bone = the readable
// foreground, shell.* = the muted/border/hover scale); brand atoms stay fixed,
// and `charcoal` stays literal because inline charcoal is icon/text on a light
// brand fill (mustard/rosa), not a neutral surface.
export function useColors() {
  const c = useThemeColors();
  return {
    ...BRAND,
    // Readable accent for inline icon/text colors on themed surfaces
    // (text-accent's runtime twin). Mustard in dark, dark ochre in light.
    accent: c.accent,
    // text-success-fg / text-danger-fg's runtime twins (ME-4).
    successFg: c.successFg,
    dangerFg: c.dangerFg,
    bone: c.foreground,
    shell: {
      bg: c.background,
      fg: c.foreground,
      dim: c.mutedForeground,
      mute: c.subtleForeground,
      border: c.border,
      hover: c.hover,
      hoverStrong: c.hoverStrong,
    },
  };
}
