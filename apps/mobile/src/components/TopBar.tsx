import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Menu } from "lucide-react-native";
import { NotificationBell } from "./NotificationBell";
import { BooksStatusPill } from "./BooksStatusPill";
import { AccountMenuSheet } from "./AccountMenuSheet";
import { border } from "@/lib/tokens";
import { useThemeColors, chrome } from "@/lib/theme";
import { topBarProgress } from "@/lib/scroll-hide";

// Total height the bar occupies (band padding + 64px pill + 8px tail). Screens
// hosting the overlay TopBar pad their content by this.
export function useTopBarHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + 12 + 64 + 8;
}

// The floating top bar, mounted INSIDE each tab screen as an ABSOLUTE overlay
// (best-practice scrolling header: content scrolls under it; hiding animates
// transform ONLY, never layout, so the scroll position is untouched and there
// is no jitter feedback loop). Screens pad their scroll content by
// useTopBarHeight() and drive topBarProgress via useScrollHide().
export function TopBar() {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const [menuOpen, setMenuOpen] = useState(false);
  const barHeight = useTopBarHeight();

  const collapse = useAnimatedStyle(() => ({
    transform: [{ translateY: -topBarProgress.value * barHeight }],
  }));

  return (
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
      <View
        className="mx-3 mb-2 h-16 flex-row items-center justify-between rounded-full px-4"
        style={{
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
        <Text className="pl-1 text-2xl font-bold lowercase text-bone">
          inklee
        </Text>

        <View className="flex-row items-center gap-2.5">
          <BooksStatusPill />
          <NotificationBell />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account menu"
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{
              borderWidth: border.hairline,
              borderColor: chrome.border,
            }}
          >
            <Menu size={20} color={chrome.fg} />
          </Pressable>
        </View>
      </View>

      <AccountMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </Animated.View>
  );
}
