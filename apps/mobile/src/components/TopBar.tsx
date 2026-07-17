import { useState } from "react";
import { Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
} from "react-native-reanimated";
import { Menu } from "lucide-react-native";
import { IconButton } from "./IconButton";
import { NotificationBell } from "./NotificationBell";
import { BooksStatusPill } from "./BooksStatusPill";
import { AccountMenuSheet } from "./AccountMenuSheet";
import { border } from "@/lib/tokens";
import { useThemeColors, chrome } from "@/lib/theme";
import { topBarProgress } from "@/lib/scroll-hide";
import { useLayoutClass } from "@/lib/layout";

// Total height the bar occupies (12px band padding + 60px pill + 12px tail).
// Screens hosting the overlay TopBar pad their content by this. At the
// expanded class the bar unmounts (the NavRail carries its functions), so the
// height collapses to just the status inset — every consumer (screen content
// tops, the bookings pinned band) adapts through this one hook.
export function useTopBarHeight() {
  const insets = useSafeAreaInsets();
  const cls = useLayoutClass();
  return cls === "expanded" ? insets.top + 12 : insets.top + 12 + 60 + 12;
}

// The floating top bar, mounted INSIDE each tab screen as an ABSOLUTE overlay
// (best-practice scrolling header: content scrolls under it; hiding animates
// transform ONLY, never layout, so the scroll position is untouched and there
// is no jitter feedback loop). Screens pad their scroll content by
// useTopBarHeight() and drive topBarProgress via useScrollHide().
export function TopBar() {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const layoutClass = useLayoutClass();
  const [menuOpen, setMenuOpen] = useState(false);
  const barHeight = useTopBarHeight();

  const collapse = useAnimatedStyle(() => ({
    transform: [{ translateY: -topBarProgress.value * barHeight }],
  }));

  // Founder: when the bar scroll-hides, the OS status readouts (time/battery)
  // floated over content. The fix is a static charcoal lens — the same pill as
  // the nav bar, centered on the screen's top edge so only its bottom half
  // shows — that stays behind them. It sits UNDER the animated band (lower
  // zIndex): covered while the bar is down, revealed as the bar slides out.
  // The visible half spans the status inset plus a small tail.
  const lensVisible = insets.top + 8;

  // Width breathes with the scroll: at rest the lens matches the nav pill's
  // 12px side insets; as the bar slides out it widens until it touches the
  // screen edges (the status readouts sat too tight against the rounded ends),
  // and shrinks back to the pill width as the bar returns.
  const lensWiden = useAnimatedStyle(() => {
    const inset = 12 * (1 - topBarProgress.value);
    return { left: inset, right: inset };
  });

  // In light mode the status readouts render dark (on the bone band); over the
  // charcoal lens they must flip to light while the bar is hidden. Mounting a
  // StatusBar conditionally overrides the root ThemedStatusBar, and unmounting
  // falls back to it. Gated on focus: the tab screen (and this bar) stays
  // mounted when a detail screen is pushed over it, and the override must not
  // leak onto that screen's themed header.
  const focused = useIsFocused();
  const [collapsed, setCollapsed] = useState(false);
  useAnimatedReaction(
    () => topBarProgress.value > 0.5,
    (cur, prev) => {
      if (cur !== prev) runOnJS(setCollapsed)(cur);
    },
  );

  // Expanded class: the NavRail owns the chrome (books status, bell, account
  // menu live in its bottom cluster), but the founder-mandated status LENS
  // stays — content pads only insets.top+12 here, so without the static lens
  // the OS readouts would float over scrolled content (review finding; the
  // lens was built for exactly that complaint). Placed AFTER every hook so
  // hook order stays stable across class flips.
  if (layoutClass === "expanded") {
    return (
      <>
        {focused ? <StatusBar style="light" /> : null}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -lensVisible,
            left: 0,
            right: 0,
            height: lensVisible * 2,
            zIndex: 39,
            borderRadius: 999,
            backgroundColor: chrome.bg,
            borderWidth: border.hairline,
            borderColor: chrome.border,
          }}
        />
      </>
    );
  }

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: -lensVisible,
            height: lensVisible * 2,
            zIndex: 39,
            borderRadius: 999,
            backgroundColor: chrome.bg,
            borderWidth: border.hairline,
            borderColor: chrome.border,
            shadowColor: "#000",
            shadowOpacity: 0.16,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          },
          lensWiden,
        ]}
      />
      {focused && collapsed ? <StatusBar style="light" /> : null}
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            backgroundColor: theme.background,
            paddingTop: insets.top + 12,
          },
          collapse,
        ]}
      >
        {/* h-[60px] matches the bottom nav pill (h-12 items + py-2.5 padding
            ≈ 60px) — founder round 10: the two pills read as one system. At
            medium the pill caps like the bottom pill so it doesn't stretch
            across a whole tablet window. */}
        <View
          className="mx-3 mb-2 h-[60px] flex-row items-center justify-between rounded-full px-4"
          style={{
            maxWidth: layoutClass === "medium" ? 500 : undefined,
            width: layoutClass === "medium" ? "100%" : undefined,
            alignSelf: layoutClass === "medium" ? "center" : undefined,
            backgroundColor: chrome.bg,
            borderWidth: border.hairline,
            borderColor: chrome.border,
            shadowColor: "#000",
            shadowOpacity: 0.16,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          <Text className="pl-1 text-[24px] font-bold lowercase text-bone">
            inklee
          </Text>

          <View className="flex-row items-center gap-2.5">
            <BooksStatusPill />
            <NotificationBell />
            <IconButton
              icon={Menu}
              label="Account menu"
              onPress={() => setMenuOpen(true)}
              size="md"
              iconSize={22}
              outlined
              borderColor={chrome.border}
              color={chrome.fg}
            />
          </View>
        </View>

        <AccountMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      </Animated.View>
    </>
  );
}
