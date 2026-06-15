import { Pressable, Text } from "react-native";

// Filter pill for status / trip filters (Requests All/Pending/Accepted/…, trip
// filter). Selected = mustard fill; idle = bone wash. Mirrors the web status
// filter chips (overview/page.tsx).
export function FilterChip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`self-start rounded-full px-3 py-1.5 ${
        selected ? "bg-mustard" : "bg-shell-hover"
      }`}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      <Text
        className={`text-label ${selected ? "text-charcoal" : "text-shell-dim"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
