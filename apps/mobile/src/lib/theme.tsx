import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "nativewind";

// MB-12 runtime theme. NativeWind drives the className colors (the `.dark`
// selector re-binds the CSS variables in global.css); this module adds (a) the
// founder-facing preference (System / Light / Dark, persisted) and (b) a JS
// palette for inline-style consumers (the chrome: TopBar, BottomNav, sheets) that
// set colors via `style` props rather than classes and so can't read the vars.
// Keep `palettes` in sync with the :root / .dark blocks in global.css.

export type ThemePreference = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

const STORAGE_KEY = "inklee.theme-preference";

export const palettes: Record<
  Scheme,
  {
    background: string;
    foreground: string;
    card: string;
    cardElevated: string;
    muted: string;
    mutedForeground: string;
    subtleForeground: string;
    border: string;
    hover: string;
    chrome: string;
  }
> = {
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
    chrome: "#ece8dd",
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
    chrome: "rgba(229,225,213,0.06)",
  },
};

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  scheme: Scheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  // Hydrate the saved preference once on mount. Default ("system") already lets
  // NativeWind follow the device, so an unset preference needs no action.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (!active) return;
      if (v === "light" || v === "dark" || v === "system") {
        setPreferenceState(v);
        setColorScheme(v);
      }
    });
    return () => {
      active = false;
    };
  }, [setColorScheme]);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    setColorScheme(p);
    void AsyncStorage.setItem(STORAGE_KEY, p);
  };

  const scheme: Scheme = colorScheme === "dark" ? "dark" : "light";

  const value = useMemo(
    () => ({ preference, setPreference, scheme }),
    // setPreference is stable enough (no deps); scheme + preference drive renders.
    [preference, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
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
export function useThemeColors() {
  const { colorScheme } = useColorScheme();
  return palettes[colorScheme === "dark" ? "dark" : "light"];
}
