import { Pressable, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { IconButton } from "@/components/IconButton";
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
        <IconButton
          icon={ChevronLeft}
          label="Previous month"
          onPress={onPrev}
          iconSize={22}
          color={colors.bone}
        />
        <Text className="text-base font-semibold text-foreground">
          {monthLabel}
        </Text>
        <IconButton
          icon={ChevronRight}
          label="Next month"
          onPress={onNext}
          iconSize={22}
          color={colors.bone}
        />
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
                ? "text-accent"
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
                }${cell.hasGuestSpot ? ", guest spot" : ""}${
                  cell.hasFlash ? ", flash day" : ""
                }`}
                accessibilityState={{ selected: isSelected }}
                className="flex-1"
              >
                <View
                  className={`m-0.5 aspect-square items-center justify-center ${
                    isSelected
                      ? "bg-mustard"
                      : cell.isToday
                        ? "border border-accent active:bg-shell-mute/20"
                        : "active:bg-shell-mute/20"
                  }`}
                  // Inline so the radius always renders on the active/today
                  // cell (the className path was not applying reliably).
                  // overflow hidden also clips the absolute marker dot inside
                  // the rounded selected cell.
                  style={{ borderRadius: 12, overflow: "hidden" }}
                >
                  {/* Founder round 4: larger numeral (16px, line box pinned at
                      20px so cells don't grow), dead-centered now that the
                      marker dot is out of flow as a footer accent. */}
                  <Text
                    className={`text-base font-semibold leading-5 ${numberTone}`}
                  >
                    {cell.day}
                  </Text>
                  {/* Type dots, web-legend vocabulary: rosa = appointments,
                      cobalt = guest spot, green = flash day. All flip to
                      charcoal on the selected mustard fill (brand tones fail
                      contrast there; the agenda below carries the detail). */}
                  {cell.count > 0 || cell.hasGuestSpot || cell.hasFlash ? (
                    <View
                      className="absolute flex-row"
                      style={{ bottom: 6, gap: 3 }}
                    >
                      {cell.count > 0 ? (
                        <View
                          className={`h-2 w-2 rounded-full ${
                            isSelected ? "bg-charcoal" : "bg-rosa"
                          }`}
                        />
                      ) : null}
                      {cell.hasGuestSpot ? (
                        <View
                          className={`h-2 w-2 rounded-full ${
                            isSelected ? "bg-charcoal" : "bg-cobalt"
                          }`}
                        />
                      ) : null}
                      {cell.hasFlash ? (
                        <View
                          className={`h-2 w-2 rounded-full ${
                            isSelected ? "bg-charcoal" : "bg-success-fg"
                          }`}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
