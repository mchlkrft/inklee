import { Text, View } from "react-native";
import { useApiQuery } from "@/lib/api";
import { colors } from "@/lib/tokens";
import { chrome } from "@/lib/theme";
import type { MobileMe } from "@inklee/shared/mobile-api";

// Glanceable books-open/closed status in the top bar, mirroring the web top
// bar's status pill (mobile-top-bar.tsx). Display-only: the open/close control
// lives on the dashboard (BooksToggle). Sits inside the fixed-dark top-bar pill,
// so its colors come from the `chrome` shell palette (bone-on-dark in both
// themes), not the content theme. Reads /me — the always-loaded identity query.
export function BooksStatusPill() {
  const { data } = useApiQuery<MobileMe>("/me");
  if (!data) return null;
  const open = data.booksOpen;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={open ? "Books open" : "Books closed"}
      className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ backgroundColor: chrome.hover }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 9999,
          backgroundColor: open ? colors.mustard : chrome.subtleFg,
        }}
      />
      <Text
        className="text-label"
        style={{ color: open ? chrome.fg : chrome.mutedFg }}
      >
        {open ? "Open" : "Closed"}
      </Text>
    </View>
  );
}
