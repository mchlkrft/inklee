import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu } from "lucide-react-native";
import { NotificationBell } from "./NotificationBell";
import { BooksStatusPill } from "./BooksStatusPill";
import { AccountMenuSheet } from "./AccountMenuSheet";
import { border, colors } from "@/lib/tokens";

// The floating dark pill mounted as the tab navigator's custom header, mirroring
// the web mobile-top-bar.tsx: wordmark (left) + books-status pill, notification
// bell, and the account-menu trigger (right). Rendered on a charcoal band so the
// faintly-elevated pill reads against the app canvas; the bar owns the top safe
// area, so tab screens drop their own top edge (see Screen.tsx). The account
// menu opens a bottom sheet — the native take on the web dropdown.
export function TopBar() {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View style={{ backgroundColor: colors.charcoal, paddingTop: insets.top + 12 }}>
      <View
        className="mx-3 mb-2 h-14 flex-row items-center justify-between rounded-full px-3"
        style={{
          backgroundColor: "rgba(229,225,213,0.06)",
          borderWidth: border.hairline,
          borderColor: colors.shell.border,
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Text className="pl-1 text-title font-bold lowercase text-bone">
          inklee
        </Text>

        <View className="flex-row items-center gap-2">
          <BooksStatusPill />
          <NotificationBell />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account menu"
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
            style={{
              borderWidth: border.hairline,
              borderColor: colors.shell.border,
            }}
          >
            <Menu size={18} color={colors.bone} />
          </Pressable>
        </View>
      </View>

      <AccountMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}
