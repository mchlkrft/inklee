import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Window-size layout classes (ME-15). Driven by the CURRENT WINDOW, never by
// device model/idiom, so Split View, Stage Manager, rotation, and Android
// multi-window all resolve to the right layout automatically.
//
//   compact  < 600           phones, narrow Split View panes
//   medium   600 - 899       portrait tablets, Split View halves
//   expanded >= 900 (and     landscape tablets, iPad Pro 13" portrait —
//     shortest side >= 600)  nav rail + master-detail territory
//
// The shortest-side guard keeps landscape phones (e.g. 932x430) out of the
// tablet chrome. Full rationale + the decision record: docs/me15-tablet-audit.md.
export type LayoutClass = "compact" | "medium" | "expanded";

export const BREAKPOINT = { medium: 600, expanded: 900 } as const;

// Canonical content width caps (style-object values — NativeWind cannot see
// interpolated classNames, so numeric widths always go through style).
export const CAP = {
  // Auth/confirmation cards: a single stack of pill buttons reads as banners
  // past ~460pt.
  authCard: 440,
  // Forms: 16/24 body text stays in the readable 65-70ch range; wider text
  // fields read as search bars.
  form: 560,
  // Feeds/lists: card rows keep the left-text -> right-action eye travel short.
  feed: 720,
  // Two ~460pt columns + gutter (dashboard/insights at expanded).
  wide: 960,
} as const;

// Master-detail pane sizing (Phase 3).
export const PANE = { list: 380, detailContent: 680 } as const;

// Centered card dialogs (sheets at medium/expanded).
export const SHEET_MAX = 520;

export function classify(width: number, height: number): LayoutClass {
  if (
    width >= BREAKPOINT.expanded &&
    Math.min(width, height) >= BREAKPOINT.medium
  ) {
    return "expanded";
  }
  if (width >= BREAKPOINT.medium) return "medium";
  return "compact";
}

const LayoutClassContext = createContext<LayoutClass>("compact");

// Mounted once in app/_layout.tsx. The context value is a PRIMITIVE on
// purpose: Stage Manager / Split View drags fire dimension updates every
// frame, but consumers only re-render when the class actually flips (600/900
// crossings). This relies on `children` staying referentially stable — do not
// make the provider's children depend on width-coupled state.
export function WindowLayoutProvider({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  return (
    <LayoutClassContext.Provider value={classify(width, height)}>
      {children}
    </LayoutClassContext.Provider>
  );
}

export function useLayoutClass(): LayoutClass {
  return useContext(LayoutClassContext);
}

export function useIsExpanded(): boolean {
  return useLayoutClass() === "expanded";
}

// Fires the callback exactly once per class flip (never on raw width changes
// mid-drag). Used by master-detail reconciliation (Rule B) and any screen that
// must react to entering/leaving a class.
export function useWindowClassTransition(
  onTransition: (prev: LayoutClass, next: LayoutClass) => void,
) {
  const cls = useLayoutClass();
  const prev = useRef(cls);
  const cb = useRef(onTransition);
  cb.current = onTransition;
  useEffect(() => {
    if (prev.current !== cls) {
      const from = prev.current;
      prev.current = cls;
      cb.current(from, cls);
    }
  }, [cls]);
}

// Bottom padding scrollable tab content needs under the nav chrome. Replaces
// the TAB_BAR_CLEARANCE constant: the floating pill overlays content
// (compact/medium), while the expanded rail reserves its own column and leaves
// only the home-indicator zone to clear. Nested detail screens that never had
// the pill keep their hardcoded 48 (decision D8, docs/me15-tablet-audit.md).
export function useTabBarClearance(): number {
  const cls = useLayoutClass();
  const insets = useSafeAreaInsets();
  return cls === "expanded" ? insets.bottom + 24 : 120;
}

// Horizontal screen gutter per class. Compact returns null: screens keep their
// existing `px-5` className untouched (NativeWind px-5 resolves to 17.5px here
// and the bookings full-bleed trick is tuned to it — do not replace with 20).
export function useScreenGutter(): number | null {
  const cls = useLayoutClass();
  if (cls === "expanded") return 32;
  if (cls === "medium") return 24;
  return null;
}

// Width-derived grid math for the real grids (goods, instagram import, flash
// day picker, reference thumbnails). Takes the CONTAINER width explicitly —
// grids can live inside panes, so window width is the wrong input. FlatList
// consumers must spread `key` (numColumns changes require a remount) and put
// the gap into columnWrapperStyle.
export function gridColumns({
  width,
  minTile,
  gap,
  max,
}: {
  width: number;
  minTile: number;
  gap: number;
  max: number;
}): { numColumns: number; tileWidth: number; key: string } {
  const fit = Math.floor((width + gap) / (minTile + gap));
  const numColumns = Math.max(1, Math.min(max, fit));
  const tileWidth = Math.floor((width - gap * (numColumns - 1)) / numColumns);
  return { numColumns, tileWidth, key: `grid-${numColumns}` };
}
