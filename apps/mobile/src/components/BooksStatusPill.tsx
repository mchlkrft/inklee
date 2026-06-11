import { Text, View } from "react-native";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import type { MobileMe } from "@inklee/shared/mobile-api";

// Glanceable books-open/closed status in the top bar, mirroring the web top
// bar's status pill (mobile-top-bar.tsx). Display-only: the open/close control
// lives on the dashboard (BooksToggle). Reads /me — the always-loaded identity
// query the root gate already holds — so it shows on every tab with no extra
// fetch. The dot carries the state; the label keeps it unambiguous.
export function BooksStatusPill() {
  const { data } = useApiQuery<MobileMe>("/me");
  const colors = useColors();
  if (!data) return null;
  const open = data.booksOpen;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={open ? "Books open" : "Books closed"}
      className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ backgroundColor: colors.shell.hover }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 9999,
          backgroundColor: open ? colors.mustard : colors.shell.mute,
        }}
      />
      <Text className={`text-label ${open ? "text-foreground" : "text-shell-dim"}`}>
        {open ? "Open" : "Closed"}
      </Text>
    </View>
  );
}
