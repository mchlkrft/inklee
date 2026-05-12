"use client";

import { localDateKey } from "@/lib/date-utils";
import { useState } from "react";
import AppointmentDrawer, { type CalendarEvent } from "./appointment-drawer";
import NewAppointmentModal from "./new-appointment-modal";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: Date[] = [];

  for (let i = startOffset; i > 0; i--) {
    grid.push(new Date(year, month, 1 - i));
  }
  for (let i = 1; i <= daysInMonth; i++) {
    grid.push(new Date(year, month, i));
  }
  let next = 1;
  while (grid.length < 42) {
    grid.push(new Date(year, month + 1, next++));
  }
  return grid;
}

function toDateKey(d: Date) {
  return localDateKey(d);
}

const TODAY = localDateKey();

export default function CalendarView({ events }: { events: CalendarEvent[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());

  const visibleEvents = events.filter((e) => !cancelled.has(e.id));

  const byDate = visibleEvents.reduce<Record<string, CalendarEvent[]>>(
    (acc, e) => {
      (acc[e.date] ??= []).push(e);
      return acc;
    },
    {},
  );

  const grid = buildMonthGrid(year, month);

  const prev = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={prev}
              className="text-muted-foreground hover:text-foreground px-2 py-1 text-lg"
            >
              ‹
            </button>
            <span className="text-base font-medium text-foreground w-40 text-center">
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              onClick={next}
              className="text-muted-foreground hover:text-foreground px-2 py-1 text-lg"
            >
              ›
            </button>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="rounded-md bg-brand-mustard px-3 py-1.5 text-sm font-medium text-brand-charcoal"
          >
            + New appointment
          </button>
        </div>

        {/* Grid */}
        <div className="rounded-[20px] overflow-hidden border border-border">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border bg-[color:var(--color-workspace-hover)]">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {grid.map((date, i) => {
              const key = toDateKey(date);
              const isCurrentMonth = date.getMonth() === month;
              const isToday = key === TODAY;
              const dayEvents = byDate[key] ?? [];

              return (
                <div
                  key={i}
                  className={`min-h-[96px] p-1.5 border-b border-r border-border ${
                    !isCurrentMonth ? "bg-brand-mustard/[0.04]" : ""
                  } ${i % 7 === 6 ? "border-r-0" : ""} ${i >= 35 ? "border-b-0" : ""}`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs mb-1 ${
                      isToday
                        ? "bg-brand-mustard text-brand-charcoal font-semibold"
                        : isCurrentMonth
                          ? "text-muted-foreground"
                          : "text-muted-foreground/45"
                    }`}
                  >
                    {date.getDate()}
                  </span>

                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => setSelected(ev)}
                        className={`w-full text-left truncate rounded-md px-1.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 ${
                          ev.origin === "artist_created"
                            ? "bg-[color:var(--color-tint-mustard)] text-brand-charcoal"
                            : "bg-[color:var(--color-tint-rosa)] text-brand-charcoal"
                        }`}
                      >
                        @{ev.handle}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-xs text-muted-foreground px-1">
                        +{dayEvents.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-tint-rosa)]" />
            Booking request
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-tint-mustard)]" />
            Added by you
          </span>
        </div>
      </div>

      <AppointmentDrawer
        event={selected}
        onClose={() => setSelected(null)}
        onCancelled={(id) => {
          setCancelled((s) => new Set([...s, id]));
          setSelected(null);
        }}
      />

      {showNew && <NewAppointmentModal onClose={() => setShowNew(false)} />}
    </>
  );
}
