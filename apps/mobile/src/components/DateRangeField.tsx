import { useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { localDateKey } from "@inklee/shared/date-utils";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { MONTH_LONG, formatDayLabel, formatShortDate, toLocalDate } from "@/lib/date";
import { themeVars, useColors, useThemePreference } from "@/lib/theme";
import { border, radius } from "@/lib/tokens";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Cursor = { year: number; month: number }; // month is 0-indexed
type Cell = { dateKey: string; day: number; inMonth: boolean };

// 6 rows x 7 cols, Monday-first (matches the calendar grid). Local Date math so a
// bare date-key never shifts across a timezone.
function buildWeeks(year: number, month: number): Cell[][] {
  const first = new Date(year, month, 1);
  const firstDow = (first.getDay() + 6) % 7; // Monday-first column index
  const weeks: Cell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Cell[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(year, month, 1 - firstDow + w * 7 + d);
      row.push({
        dateKey: localDateKey(cell),
        day: cell.getDate(),
        inMonth: cell.getMonth() === month,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

function rangeLabel(start: string | null, end: string | null): string {
  if (!start) return "Select dates";
  if (!end || end === start) return formatShortDate(start);
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

// One field for a trip stop's date(s): tap to open a branded, theme-aware month
// calendar. Pick a start, then an end for a period, or confirm a single day
// (end stays null and the caller treats it as a one-day stop). Replaces the two
// separate Start/End DateFields. The end is always on or after the start by
// construction, so no min-date wiring is needed.
export function DateRangeField({
  label,
  startValue,
  endValue,
  onChange,
}: {
  label?: string;
  startValue: string | null;
  endValue: string | null;
  onChange: (start: string | null, end: string | null) => void;
}) {
  const c = useColors();
  const { scheme } = useThemePreference();
  const insets = useSafeAreaInsets();
  const todayKey = useMemo(() => localDateKey(), []);

  const [visible, setVisible] = useState(false);
  const [start, setStart] = useState<string | null>(startValue);
  const [end, setEnd] = useState<string | null>(endValue);
  const [cursor, setCursor] = useState<Cursor>(() => {
    const base = startValue ? toLocalDate(startValue) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  function open() {
    // Re-seed from the committed value each open so a cancelled session (close
    // via backdrop/X) leaves the field untouched.
    setStart(startValue);
    setEnd(endValue);
    const base = startValue ? toLocalDate(startValue) : new Date();
    setCursor({ year: base.getFullYear(), month: base.getMonth() });
    setVisible(true);
  }

  function shift(delta: number) {
    setCursor((cur) => {
      const m = cur.month + delta;
      return { year: cur.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  function pick(dateKey: string) {
    // No selection yet, or a complete range -> begin a fresh selection.
    if (!start || (start && end)) {
      setStart(dateKey);
      setEnd(null);
      return;
    }
    // A start is set, no end yet.
    if (dateKey < start) {
      // Tapped earlier than the start -> move the start back.
      setStart(dateKey);
      setEnd(null);
      return;
    }
    // dateKey >= start. Same day keeps it a single date; a later day makes a range.
    setEnd(dateKey === start ? null : dateKey);
  }

  function confirm() {
    onChange(start, end);
    setVisible(false);
  }

  const weeks = useMemo(
    () => buildWeeks(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  return (
    <View className="mb-3">
      {label ? (
        <Text className="mb-1.5 text-sm font-medium text-foreground">
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose dates"
        onPress={open}
        className="h-12 flex-row items-center rounded-xl border-brand border-shell-border px-4 active:opacity-80"
      >
        <Text
          className={`flex-1 text-base ${startValue ? "text-foreground" : "text-shell-mute"}`}
        >
          {rangeLabel(startValue, endValue)}
        </Text>
        <CalendarRange size={18} color={c.shell.mute} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
        statusBarTranslucent
      >
        {/* Re-apply theme vars: a RN Modal portals outside the ThemeProvider, so
            the className `var(--…)` tokens would fall back to the dark :root and
            the sheet would render dark even in light mode. */}
        <Pressable
          accessibilityLabel="Close date picker"
          onPress={() => setVisible(false)}
          className="flex-1 justify-end"
          style={[themeVars[scheme], { backgroundColor: "rgba(0,0,0,0.5)" }]}
        >
          {/* Stop taps inside the sheet from closing it. */}
          <Pressable
            onPress={() => {}}
            className="px-5 pt-4"
            style={{
              backgroundColor: c.shell.bg,
              borderTopWidth: border.brand,
              borderColor: c.shell.border,
              borderTopLeftRadius: radius.card,
              borderTopRightRadius: radius.card,
              paddingBottom: insets.bottom + 16,
            }}
          >
            {/* Title + live selection summary + close */}
            <View className="mb-3 flex-row items-start justify-between">
              <View className="flex-1 pr-2">
                <Text className="text-base font-semibold text-foreground">
                  Select dates
                </Text>
                <Text className="mt-0.5 text-sm text-accent">
                  {rangeLabel(start, end)}
                </Text>
              </View>
              <IconButton
                icon={X}
                label="Close"
                onPress={() => setVisible(false)}
                iconSize={20}
                color={c.shell.dim}
              />
            </View>

            {/* Month header */}
            <View className="mb-3 flex-row items-center justify-between">
              <IconButton
                icon={ChevronLeft}
                label="Previous month"
                onPress={() => shift(-1)}
                iconSize={22}
                color={c.bone}
              />
              <Text className="text-base font-semibold text-foreground">
                {MONTH_LONG[cursor.month]} {cursor.year}
              </Text>
              <IconButton
                icon={ChevronRight}
                label="Next month"
                onPress={() => shift(1)}
                iconSize={22}
                color={c.bone}
              />
            </View>

            {/* Weekday header */}
            <View className="mb-1 flex-row">
              {WEEKDAYS.map((w) => (
                <View key={w} className="flex-1 items-center">
                  <Text className="text-xs font-medium text-shell-mute">{w}</Text>
                </View>
              ))}
            </View>

            {/* Grid */}
            {weeks.map((week, w) => (
              <View key={w} className="flex-row">
                {week.map((cell) => {
                  const isStart = !!start && cell.dateKey === start;
                  const isEnd = !!end && cell.dateKey === end;
                  const isEndpoint = isStart || isEnd;
                  const inRange =
                    !!start && !!end && cell.dateKey > start && cell.dateKey < end;
                  const isToday = cell.dateKey === todayKey;

                  const tone = isEndpoint
                    ? "text-charcoal"
                    : inRange
                      ? "text-foreground"
                      : isToday
                        ? "text-accent"
                        : cell.inMonth
                          ? "text-foreground"
                          : "text-shell-mute";
                  const fill = isEndpoint
                    ? "bg-mustard"
                    : inRange
                      ? "bg-mustard/20"
                      : isToday
                        ? "border border-accent active:bg-shell-mute/20"
                        : "active:bg-shell-mute/20";

                  return (
                    <Pressable
                      key={cell.dateKey}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatDayLabel(cell.dateKey)}${
                        isToday ? ", today" : ""
                      }`}
                      accessibilityState={{ selected: isEndpoint || inRange }}
                      onPress={() => pick(cell.dateKey)}
                      className="flex-1"
                    >
                      <View
                        className={`m-0.5 aspect-square items-center justify-center ${fill}`}
                        style={{ borderRadius: 12, overflow: "hidden" }}
                      >
                        <Text
                          className={`text-base font-semibold leading-5 ${tone}`}
                        >
                          {cell.day}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Text className="mb-4 mt-3 text-xs leading-snug text-shell-dim">
              Tap a start date, then an end date for a period. Tap once and
              confirm for a single day.
            </Text>

            <View className="flex-row items-center justify-between">
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStart(null);
                  setEnd(null);
                }}
                hitSlop={8}
                className="px-2 py-2 active:opacity-70"
              >
                <Text className="text-sm font-medium text-shell-dim">Clear</Text>
              </Pressable>
              <Button
                label="Done"
                onPress={confirm}
                disabled={!start}
                size="sm"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
