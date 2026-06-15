import { View } from "react-native";
import type { ComponentType } from "react";
import { tint, type TintRole } from "@/lib/tokens";

/** Any icon honouring the lucide size/color contract — lucide icons plus the
 *  brand Spiderweb. */
export type ChipIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

// Circular solid-tint badge that leads section/widget headers — the web's
// IconChip (apps/web/src/components/ui/card.tsx), and the single biggest "Inklee
// character" win on mobile. Solid brand fill + contrast icon, mirroring the web
// TINT_CLASSES via the `tint` token map. Uses inline style for the tint pair so
// the bg/fg come straight from the JS token (no class generation needed).
export function IconChip({
  icon: Icon,
  role = "bone",
  size = "md",
  iconSize,
}: {
  icon: ChipIcon;
  role?: TintRole;
  size?: "sm" | "md";
  /** Override the glyph size inside the (unchanged) circle. */
  iconSize?: number;
}) {
  const dim = size === "md" ? 40 : 32;
  const glyph = iconSize ?? (size === "md" ? 18 : 16);
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
      <Icon size={glyph} color={fg} strokeWidth={1.8} />
    </View>
  );
}
