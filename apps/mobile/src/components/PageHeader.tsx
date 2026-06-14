import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { IconChip, type ChipIcon } from "./IconChip";
import type { TintRole } from "@/lib/tokens";

// text-display line height (tailwind.config.js fontSize.display). The chip is
// centered against the title's FIRST line via a line-height-tall wrapper, so a
// long subtitle (or a wrapped title) no longer drags it down to the middle of
// the whole text block.
const TITLE_LINE_HEIGHT = 34;

// Screen title (display type) + optional leading nav-icon chip + optional
// subtitle / trailing action. Replaces the inline <Text> screen titles and
// mirrors the web h1 + subtitle page-header pattern. The icon (founder round
// 10) is the page's bottom-nav glyph in a brand-tint chip, left of the h1.
export function PageHeader({
  title,
  subtitle,
  trailing,
  icon,
  iconRole,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  icon?: ChipIcon;
  iconRole?: TintRole;
}) {
  return (
    <View className="mb-5 flex-row items-start justify-between gap-3">
      {icon ? (
        <View style={{ height: TITLE_LINE_HEIGHT, justifyContent: "center" }}>
          <IconChip icon={icon} role={iconRole} iconSize={22} />
        </View>
      ) : null}
      <View className="flex-1">
        <Text className="text-display font-bold text-foreground">{title}</Text>
        {subtitle ? (
          <Text className="mt-1 text-subtitle text-shell-dim">{subtitle}</Text>
        ) : null}
      </View>
      {trailing ?? null}
    </View>
  );
}
