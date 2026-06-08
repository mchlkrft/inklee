import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/tokens";

// A single settings row: a label on the left, an optional value/affordance on
// the right. Tappable rows show a chevron (or an "external" icon for links).
// Group several inside a Card; pass `divider` for all but the first.
export function SettingsRow({
  label,
  value,
  valueTone = "text-shell-dim",
  onPress,
  external = false,
  divider = false,
  danger = false,
}: {
  label: string;
  value?: string | null;
  valueTone?: string;
  onPress?: () => void;
  external?: boolean;
  divider?: boolean;
  danger?: boolean;
}) {
  const body = (
    <View
      className={`flex-row items-center justify-between py-3 ${
        divider ? "border-t border-shell-border" : ""
      }`}
    >
      <Text
        className={`flex-1 pr-3 text-base ${danger ? "text-danger" : "text-bone"}`}
      >
        {label}
      </Text>
      <View className="flex-row items-center gap-1">
        {value ? (
          <Text className={`text-sm ${valueTone}`} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {onPress ? (
          <Ionicons
            name={external ? "open-outline" : "chevron-forward"}
            size={16}
            color={colors.shell.mute}
          />
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      className="active:opacity-70"
    >
      {body}
    </Pressable>
  );
}
