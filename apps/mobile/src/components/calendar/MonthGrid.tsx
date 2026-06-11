import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DayCell } from "@/lib/calendar";
import { formatDayLabel } from "@/lib/date";
import { useColors } from "@/lib/theme";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Pure, presentational month grid. All date math is done upstream (lib/calendar)
// and handed in as pre-computed cells; this component only renders + reports taps.
export function MonthGrid(props: {
  monthLabel: string;
  weeks: DayCell[][];
  selectedDate: string;
  onSelectDay: (dateKey: string) => void;
  onPrev: () => void;
  onNext: () => void;
}): React.JSX.Element {
  const { monthLabel, weeks, selectedDate, onSelectDay, onPrev, onNext } = props;
  const colors = useColors();

  return (
    <View>
      {/* Header: prev chevron · month label · next chevron */}
      <View className="mb-3 flex-row items-center justify-between">
        <Pressable
          onPress={onPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
        >
          <Ionicons name="chevron-back" size={22} color={colors.bone} />
        </Pressable>

        <Text className="text-base font-semibold text-foreground">
          {monthLabel}
        </Text>

        <Pressable
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
        >
          <Ionicons name="chevron-forward" size={22} color={colors.bone} />
        </Pressable>
      </View>

      {/* Weekday header */}
      <View className="mb-1 flex-row">
        {WEEKDAYS.map((label) => (
          <View key={label} className="flex-1 items-center">
            <Text className="text-xs font-medium text-shell-mute">{label}</Text>
          </View>
        ))}
      </View>

      {/* Grid: 6 rows × 7 cols */}
      {weeks.map((week, w) => (
        <View key={w} className="flex-row">
          {week.map((cell) => {
            const isSelected = cell.dateKey === selectedDate;
            const numberTone = isSelected
              ? "text-charcoal"
              : cell.isToday
                ? "text-mustard"
                : cell.inMonth
                  ? "text-foreground"
                  : "text-shell-mute";

            return (
              <Pressable
                key={cell.dateKey}
                onPress={() => onSelectDay(cell.dateKey)}
                accessibilityRole="button"
                accessibilityLabel={`${formatDayLabel(cell.dateKey)}${
                  cell.isToday ? ", today" : ""
                }${
                  cell.count > 0
                    ? `, ${cell.count} appointment${cell.count === 1 ? "" : "s"}`
                    : ""
                }`}
                accessibilityState={{ selected: isSelected }}
                className="flex-1"
              >
                <View
                  className={`m-0.5 aspect-square items-center justify-center ${
                    isSelected
                      ? "bg-mustard"
                      : cell.isToday
                        ? "border border-mustard active:bg-shell-mute/20"
                        : "active:bg-shell-mute/20"
                  }`}
                  // Inline so the radius always renders on the active/today
                  // cell (the className path was not applying reliably).
                  style={{ borderRadius: 12, overflow: "hidden" }}
                >
                  <Text className={`text-sm font-semibold ${numberTone}`}>
                    {cell.day}
                  </Text>
                  {cell.count > 0 ? (
                    <View
                      className={`mt-1 h-1.5 w-1.5 rounded-full ${
                        isSelected ? "bg-charcoal" : "bg-rosa"
                      }`}
                    />
                  ) : (
                    <View className="mt-1 h-1.5 w-1.5" />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
