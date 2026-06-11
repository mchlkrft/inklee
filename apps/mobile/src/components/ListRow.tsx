import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { border } from "@/lib/tokens";
import { useColors } from "@/lib/theme";

// Unifies the hand-rolled rows (requests, clients, flash, products). Variants by
// prop: `leading` thumbnail/icon-chip, `status` trailing pill, `showChevron` for
// navigation, 1.5px `divider`. Mirrors the web divide-y list-row pattern.
export function ListRow({
  title,
  subtitle,
  leading,
  status,
  trailing,
  onPress,
  showChevron = false,
  divider = true,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  status?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  divider?: boolean;
}) {
  const colors = useColors();
  const inner = (
    <View
      className="flex-row items-center gap-3 py-3"
      style={
        divider
          ? { borderBottomWidth: border.brand, borderColor: colors.shell.border }
          : undefined
      }
    >
      {leading ?? null}
      <View className="flex-1">
        <Text className="text-body font-medium text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-caption text-shell-dim" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {status ?? null}
      {trailing ?? null}
      {showChevron && onPress ? (
        <ChevronRight size={18} color={colors.shell.mute} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}
