import { View } from "react-native";
import type { LucideIcon } from "@/lib/icon-types";
import { tint, type TintRole } from "@/lib/tokens";

// Circular solid-tint badge that leads section/widget headers — the web's
// IconChip (apps/web/src/components/ui/card.tsx), and the single biggest "Inklee
// character" win on mobile. Solid brand fill + contrast icon, mirroring the web
// TINT_CLASSES via the `tint` token map. Uses inline style for the tint pair so
// the bg/fg come straight from the JS token (no class generation needed).
export function IconChip({
  icon: Icon,
  role = "bone",
  size = "md",
}: {
  icon: LucideIcon;
  role?: TintRole;
  size?: "sm" | "md";
}) {
  const dim = size === "md" ? 40 : 32;
  const iconSize = size === "md" ? 18 : 16;
  const { bg, fg } = tint[role];
  return (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={iconSize} color={fg} strokeWidth={1.8} />
    </View>
  );
}
