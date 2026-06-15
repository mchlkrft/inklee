import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColors } from "@/lib/theme";

// Card-style drill-down row on a tab root (Flash -> "Flash days",
// Guest Spots -> "Studios"). One definition for what was two byte-identical
// hand-rolled Pressables; the caller supplies any margin via the wrapper.
export function NavCardRow({
  icon,
  label,
  onPress,
  className = "",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Margin classes only (e.g. "mb-1 mt-3"); the row's own look is fixed. */
  className?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass p-4 active:opacity-80 ${className}`}
    >
      <View className="flex-row items-center gap-2">
        <Ionicons name={icon} size={18} color={colors.accent} />
        <Text className="text-base font-semibold text-foreground">{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.shell.mute} />
    </Pressable>
  );
}
