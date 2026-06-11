import { Pressable, Text } from "react-native";

// Small inline pill action (the Copy link / Preview pattern). Founder round 4
// button sweep: one fixed 36px height for what used to be three divergent
// paddings. Full-size actions use Button; this stays deliberately compact for
// inline link rows inside cards.
export function PillButton({
  label,
  onPress,
  filled = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  /** Mustard fill for the rare primary-flavored inline action. */
  filled?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`h-9 items-center justify-center rounded-full px-4 ${
        filled ? "bg-mustard" : "border border-shell-border"
      } ${disabled ? "opacity-50" : "active:opacity-70"}`}
    >
      <Text
        className={`text-label ${filled ? "text-charcoal" : "text-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
