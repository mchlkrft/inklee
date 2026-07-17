import { useCallback, useEffect, useRef } from "react";
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { makeMutable, withTiming } from "react-native-reanimated";
import { useFocusEffect } from "expo-router";
import { useIsExpanded } from "@/lib/layout";

// Shared top-bar visibility (0 = shown, 1 = hidden), animated on the UI thread.
// The TopBar collapses off this value; any scrollable screen drives it through
// useScrollHide(). Instagram-story-header behaviour: hide after a bit of
// downward scroll, reveal after a bit of upward scroll (not instantly), always
// shown near the top.
export const topBarProgress = makeMutable(0);

const HIDE_AFTER = 28; // px of accumulated downward scroll before hiding
const SHOW_AFTER = 20; // px of accumulated upward scroll before revealing
const TOP_ZONE = 12; // always visible this close to the top

// A tab/screen regaining focus always starts with the bar visible, so a bar
// hidden on one tab never strands another tab without its header. Every screen
// that MOUNTS the TopBar must run this — scroll-driving screens get it via
// useScrollHide; static-header screens (the bookings layout, whose bar never
// scroll-hides) call it directly, or a stale progress=1 from another tab parks
// their bar off-screen with no scroll handler to ever bring it back.
export function useTopBarReset() {
  // At the expanded class the TopBar unmounts (NavRail owns the chrome) and
  // nothing scroll-hides. Pin progress to 0 so (a) the bookings pinned band
  // never rises, and (b) a bar hidden mid-scroll when the window crosses into
  // expanded is not stranded hidden when it shrinks back (ME-15).
  const expanded = useIsExpanded();
  useEffect(() => {
    if (expanded) topBarProgress.value = 0;
  }, [expanded]);

  useFocusEffect(
    useCallback(() => {
      topBarProgress.value = withTiming(0, { duration: 180 });
    }, []),
  );
}

export function useScrollHide() {
  const lastY = useRef(0);
  const accum = useRef(0);
  const expanded = useIsExpanded();

  useTopBarReset();
  useFocusEffect(
    useCallback(() => {
      accum.current = 0;
    }, []),
  );

  return useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Expanded: no bar to hide; keep progress pinned (see useTopBarReset).
    if (expanded) return;

    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;

    if (y <= TOP_ZONE) {
      accum.current = 0;
      topBarProgress.value = withTiming(0, { duration: 180 });
      return;
    }
    // Direction change resets the accumulator so tiny jitters don't toggle it.
    if ((dy > 0 && accum.current < 0) || (dy < 0 && accum.current > 0)) {
      accum.current = 0;
    }
    accum.current += dy;
    if (accum.current > HIDE_AFTER) {
      topBarProgress.value = withTiming(1, { duration: 220 });
    } else if (accum.current < -SHOW_AFTER) {
      topBarProgress.value = withTiming(0, { duration: 220 });
    }
  }, [expanded]);
}
