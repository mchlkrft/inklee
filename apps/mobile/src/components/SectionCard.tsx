import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { IconChip } from "./IconChip";
import { Card } from "./Card";
import { border, colors, type TintRole } from "@/lib/tokens";

// Overline label (+ optional icon chip / description) above a 1.5px bottom
// border — the web settings-section pattern (bookings/settings/page.tsx). The
// 1.5px border is inline-styled for reliability (directional borders).
export function SectionHeader({
  icon,
  tint,
  label,
  description,
}: {
  icon?: LucideIcon;
  tint?: TintRole;
  label: string;
  description?: string;
}) {
  return (
    <View
      className="flex-row items-center gap-3 pb-3"
      style={{
        borderBottomWidth: border.brand,
        borderColor: colors.shell.border,
      }}
    >
      {icon ? <IconChip icon={icon} role={tint} size="sm" /> : null}
      <View className="flex-1">
        <Text className="text-overline uppercase text-shell-mute">{label}</Text>
        {description ? (
          <Text className="mt-0.5 text-caption text-shell-dim">{description}</Text>
        ) : null}
      </View>
    </View>
  );
}

// A Card with a SectionHeader and body. Used by Settings, the booking detail,
// and dashboard widget groups.
export function SectionCard({
  icon,
  tint,
  label,
  description,
  children,
}: {
  icon?: LucideIcon;
  tint?: TintRole;
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <SectionHeader
        icon={icon}
        tint={tint}
        label={label}
        description={description}
      />
      <View className="mt-4">{children}</View>
    </Card>
  );
}
