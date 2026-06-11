import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { IconChip } from "./IconChip";
import type { TintRole } from "@/lib/tokens";

// Leading icon chip + title (+ optional subtitle / trailing). Mirrors the web
// CardHeader (apps/web/src/components/ui/card.tsx). Compose inside a Card.
export function CardHeader({
  icon,
  tint,
  title,
  subtitle,
  trailing,
}: {
  icon?: LucideIcon;
  tint?: TintRole;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3">
      {icon ? <IconChip icon={icon} role={tint} /> : null}
      <View className="flex-1">
        <Text className="text-title font-semibold text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-caption text-shell-dim" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? null}
    </View>
  );
}
