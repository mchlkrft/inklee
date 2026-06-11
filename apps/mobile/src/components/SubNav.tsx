import { Pressable, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors } from "@/lib/tokens";
import { useColors } from "@/lib/theme";

export type SubNavItem = {
  label: string;
  icon: LucideIcon;
  path: string;
};

// Icon segmented control for sibling-route sub-navigation (Bookings:
// Requests / Calendar / Clients). One full-width pill track with equal
// segments; the active segment gets the mustard fill + charcoal icon/label —
// the app's established active-state language (FilterChip, Segmented,
// BottomNav). Deliberately separate from Segmented.tsx, which is a form enum
// picker with its own geometry and consumers.
export function SubNav({
  items,
  activePath,
  onSelect,
}: {
  items: readonly SubNavItem[];
  activePath: string;
  onSelect: (path: string) => void;
}) {
  const themed = useColors();
  return (
    <View className="flex-row rounded-full bg-shell-hover p-1">
      {items.map(({ label, icon: Icon, path }) => {
        const selected = path === activePath;
        return (
          <Pressable
            key={path}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(path)}
            className={`h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-full ${
              selected ? "bg-mustard" : "active:opacity-70"
            }`}
          >
            <Icon
              size={16}
              strokeWidth={selected ? 2 : 1.7}
              color={selected ? colors.charcoal : themed.shell.dim}
            />
            <Text
              numberOfLines={1}
              className={`text-label ${
                selected ? "text-charcoal" : "text-shell-dim"
              }`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
