import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors } from "@/lib/tokens";

// MB-2: optional bone-tinted Lucide icon above the title (the web empty states
// have visual warmth; mobile was text-only). API stays backward-compatible.
export function EmptyState({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}) {
  return (
    <View className="items-center justify-center py-16">
      {Icon ? (
        <View className="mb-3 h-12 w-12 items-center justify-center rounded-full bg-shell-hover">
          <Icon size={22} color={colors.shell.dim} strokeWidth={1.8} />
        </View>
      ) : null}
      <Text className="text-center text-base font-semibold text-foreground">
        {title}
      </Text>
      {subtitle ? (
        <Text className="mt-1 text-center text-sm text-shell-dim">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
