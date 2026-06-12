import { Pressable } from "react-native";
import type { LucideIcon } from "@/lib/icon-types";
import { useColors } from "@/lib/theme";

// Circular icon-only button (top-bar menu, sheet close X, month arrows,
// steppers, remove-row X). Founder round 4 button sweep: one geometry for what
// used to be four hand-rolled sizes. Fixed-dark chrome surfaces (TopBar,
// AccountMenuSheet) pass `color`/`borderColor` explicitly so they stay
// bone-on-dark in both themes.
export function IconButton({
  icon: Icon,
  label,
  onPress,
  size = "sm",
  outlined = false,
  iconSize = 20,
  color,
  borderColor,
  disabled = false,
}: {
  icon: LucideIcon;
  /** Required: icon buttons have no visible text. */
  label: string;
  onPress: () => void;
  size?: "sm" | "md";
  outlined?: boolean;
  iconSize?: number;
  color?: string;
  borderColor?: string;
  disabled?: boolean;
}) {
  const themed = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={size === "sm" ? 6 : 4}
      className={`items-center justify-center rounded-full ${
        size === "md" ? "h-11 w-11" : "h-10 w-10"
      } ${outlined && !borderColor ? "border-brand border-shell-border" : ""} ${
        disabled ? "opacity-50" : "active:opacity-70"
      }`}
      style={
        outlined && borderColor ? { borderWidth: 1, borderColor } : undefined
      }
    >
      <Icon size={iconSize} color={color ?? themed.bone} />
    </Pressable>
  );
}
