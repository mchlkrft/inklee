import { useMemo, useState } from "react";
import { useApiQuery } from "./api";
import { MONTH_LONG } from "./date";
import { localDateKey } from "@inklee/shared/date-utils";

// Re-exported so existing importers (MonthGrid, DayAgenda) keep their path.
export { formatDayLabel } from "./date";

// One confirmed appointment from GET /api/mobile/calendar (approved, dated
// bookings). `date` is a bare YYYY-MM-DD date-key — bookings have no time.
export type CalendarAppointment = {
  id: string;
  client: string;
  placement: string | null;
  date: string;
};

// One cell of the month grid. All date math is done here so the MonthGrid
// component stays purely presentational.
export type DayCell = {
  dateKey: string; // YYYY-MM-DD
  day: number; // day-of-month, 1..31
  inMonth: boolean; // false for leading/trailing days from adjacent months
  isToday: boolean;
  count: number; // appointments on this day
};

type Cursor = { year: number; month: number }; // month is 0-indexed


// 6 rows × 7 cols, Monday-first, matching the web calendar grid. Built from
// local Date arithmetic (which rolls negative/overflow days over month and year
// boundaries) and keyed with the shared localDateKey so cells compare against
// the server's bare date-keys with the same local-day semantics.
function buildWeeks(year: number, month: number): DayCell[][] {
  const todayKey = localDateKey();
  const first = new Date(year, month, 1);
  // JS getDay(): 0=Sun..6=Sat. Monday-first column index = (getDay()+6)%7.
  const firstDow = (first.getDay() + 6) % 7;

  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(year, month, 1 - firstDow + w * 7 + d);
      const dateKey = localDateKey(cellDate);
      row.push({
        dateKey,
        day: cellDate.getDate(),
        inMonth: cellDate.getMonth() === month,
        isToday: dateKey === todayKey,
        count: 0,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

function groupByDate(
  items: CalendarAppointment[],
): Record<string, CalendarAppointment[]> {
  const map: Record<string, CalendarAppointment[]> = {};
  for (const item of items) {
    (map[item.date] ??= []).push(item);
  }
  return map;
}

// Shift a 0-indexed month cursor by ±N months, rolling over year boundaries.
function shiftMonth(c: Cursor, delta: number): Cursor {
  const m = c.month + delta;
  return {
    year: c.year + Math.floor(m / 12),
    month: ((m % 12) + 12) % 12,
  };
}

const firstOfMonthKey = (c: Cursor): string =>
  localDateKey(new Date(c.year, c.month, 1));

/**
 * Owns the displayed month, fetches the appointments covering the *visible*
 * grid range (so leading/trailing cells show counts too), groups them by date,
 * and folds the per-day counts into the grid. The screen owns the selected day.
 */
export function useCalendarMonth() {
  const [cursor, setCursor] = useState<Cursor>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  // Selected day lives here so the grid and the agenda below it stay in sync.
  // Defaults to today; month navigation moves it to the 1st of the new month.
  const [selectedDate, setSelectedDate] = useState<string>(() => localDateKey());

  function goToMonth(delta: number) {
    const next = shiftMonth(cursor, delta);
    setCursor(next);
    setSelectedDate(firstOfMonthKey(next));
  }

  const grid = useMemo(
    () => buildWeeks(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );
  const fromKey = grid[0][0].dateKey;
  const toKey = grid[5][6].dateKey;

  const query = useApiQuery<{ items: CalendarAppointment[] }>(
    `/calendar?from=${fromKey}&to=${toKey}`,
  );

  const appointmentsByDate = useMemo(
    () => groupByDate(query.data?.items ?? []),
    [query.data],
  );

  const weeks = useMemo(
    () =>
      grid.map((row) =>
        row.map((cell) => ({
          ...cell,
          count: appointmentsByDate[cell.dateKey]?.length ?? 0,
        })),
      ),
    [grid, appointmentsByDate],
  );

  return {
    monthLabel: `${MONTH_LONG[cursor.month]} ${cursor.year}`,
    weeks,
    selectedDate,
    selectDay: setSelectedDate,
    selectedAppointments: appointmentsByDate[selectedDate] ?? [],
    loading: query.loading,
    error: query.error,
    refreshing: query.refreshing,
    refresh: query.refresh,
    goPrevMonth: () => goToMonth(-1),
    goNextMonth: () => goToMonth(1),
  };
}
