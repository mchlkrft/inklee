import { Pressable, Text, View } from "react-native";
import { SlidersHorizontal } from "lucide-react-native";
import { useColors } from "@/lib/theme";

// Collapsed-filter affordance — the mobile port of the web bookings
// filter-row.tsx. A single pill that reveals the filter chips on tap; when a
// filter is active it appends "· {label}" plus a rosa count badge (the
// NotificationBell badge pattern) so the active filter stays legible while
// collapsed.
export function FilterToggle({
  open,
  onToggle,
  activeCount,
  activeLabel,
}: {
  open: boolean;
  onToggle: () => void;
  activeCount: number;
  activeLabel?: string | null;
}) {
  const themed = useColors();
  const active = activeCount > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={
        activeLabel
          ? `Filter, ${activeLabel} active`
          : active
            ? `Filter, ${activeCount} active`
            : "Filter requests"
      }
      onPress={onToggle}
      className="h-9 flex-row items-center gap-2 self-start rounded-full border border-shell-border px-4 active:opacity-70"
    >
      <SlidersHorizontal
        size={14}
        color={active ? themed.bone : themed.shell.dim}
      />
      <Text className={`text-label ${active ? "text-foreground" : "text-shell-dim"}`}>
        Filter
        {activeLabel ? <Text className="text-foreground"> · {activeLabel}</Text> : null}
      </Text>
      {active ? (
        <View className="min-w-[18px] items-center justify-center rounded-full bg-rosa px-1" style={{ height: 18 }}>
          <Text
            className="text-[10px] font-bold text-charcoal"
            style={{ lineHeight: 12, includeFontPadding: false }}
          >
            {activeCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
