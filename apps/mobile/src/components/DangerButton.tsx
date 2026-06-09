import { Pressable, Text } from "react-native";

// Understated destructive text action (e.g. "Delete trip"). A subtle red link
// rather than a filled button — used for secondary delete actions at the bottom
// of edit screens. Factored out of the hand-copied Pressables.
export function DangerButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`mt-6 h-11 items-center justify-center active:opacity-70 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <Text className="text-sm font-semibold text-danger">{label}</Text>
    </Pressable>
  );
}
