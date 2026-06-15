import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BooksQuickSheet } from "./BooksQuickSheet";
import { useApiQuery } from "@/lib/api";
import { colors } from "@/lib/tokens";
import { chrome } from "@/lib/theme";
import type { MobileMe } from "@inklee/shared/mobile-api";

// Books open/closed status in the top bar, mirroring the web top bar's status
// pill (mobile-top-bar.tsx). Founder round 4: tappable — opens the quick sheet
// with the open/close toggle (the dashboard status card is gone). Sits inside
// the fixed-dark top-bar pill, so its colors come from the `chrome` shell
// palette (bone-on-dark in both themes), not the content theme. Reads /me,
// whose booksOpen is the EFFECTIVE state (flag + window expiry, matching
// /home; cap-reached / slots-closed states are not reflected here).
export function BooksStatusPill() {
  const { data } = useApiQuery<MobileMe>("/me");
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!data) return null;
  const open = data.booksOpen;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          open ? "Books open. Change booking status" : "Books closed. Change booking status"
        }
        onPress={() => setSheetOpen(true)}
        hitSlop={8}
        className="flex-row items-center gap-1.5 rounded-full px-3 py-2 active:opacity-70"
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
      </Pressable>
      <BooksQuickSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
