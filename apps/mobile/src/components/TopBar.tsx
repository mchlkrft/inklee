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

// The floating themed pill mounted as the tab navigator's custom header, mirroring
// the web mobile-top-bar.tsx: wordmark (left) + books-status pill, notification
// bell, and the account-menu trigger (right). Rendered on a themed band so the
// faintly-elevated pill reads against the app canvas; the bar owns the top safe
// area, so tab screens drop their own top edge (see Screen.tsx). MB-13: themed +
// slightly larger overall. The account menu opens from the top, near the trigger.
export function TopBar() {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const [menuOpen, setMenuOpen] = useState(false);

  // Scroll-hide: slide the whole bar up and pull the content after it (the
  // negative bottom margin collapses the reserved header space), driven by the
  // shared topBarProgress that the screens' scroll handlers animate.
  const barHeight = insets.top + 12 + 64 + 8;
  const collapse = useAnimatedStyle(() => ({
    transform: [{ translateY: -topBarProgress.value * barHeight }],
    marginBottom: -topBarProgress.value * barHeight,
  }));

  return (
    <Animated.View
      style={[
        { backgroundColor: theme.background, paddingTop: insets.top + 12 },
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
