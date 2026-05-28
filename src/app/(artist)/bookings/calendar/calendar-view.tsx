"use client";

import { localDateKey } from "@/lib/date-utils";
import { useState } from "react";
import { Plus } from "lucide-react";
import Link from "next/link";
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

export type CalendarTripLeg = {
  id: string;
  startsOn: string;
  endsOn: string;
  label: string;
};
export type CalendarFlashDay = { id: string; date: string; title: string };

type CellMarker =
  | { k: "trip"; id: string; label: string }
  | { k: "booking"; ev: CalendarEvent }
  | { k: "flash"; id: string; title: string };

// Inclusive list of YYYY-MM-DD keys between two dates (capped for safety).
function eachDayKey(startKey: string, endKey: string): string[] {
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const out: string[] = [];
  let guard = 0;
  while (cur <= end && guard++ < 400) {
    out.push(localDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export default function CalendarView({
  events,
  tripLegs = [],
  flashDays = [],
}: {
  events: CalendarEvent[];
  tripLegs?: CalendarTripLeg[];
  flashDays?: CalendarFlashDay[];
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [showNew, setShowNew] = useState(false);
  // Pre-fills the modal date when a date cell is clicked. Null for the header
  // "+ New appointment" button so the user picks fresh.
  const [newDate, setNewDate] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());

  const visibleEvents = events.filter((e) => !cancelled.has(e.id));

  const byDate = visibleEvents.reduce<Record<string, CalendarEvent[]>>(
    (acc, e) => {
      (acc[e.date] ??= []).push(e);
      return acc;
    },
    {},
  );

  const flashByDate = flashDays.reduce<Record<string, CalendarFlashDay[]>>(
    (acc, f) => {
      (acc[f.date] ??= []).push(f);
      return acc;
    },
    {},
  );

  // Trip legs become a faint background band across their days; the leg's start
  // day also gets a label chip. This keeps multi-day spans from cluttering the
  // chip stack.
  const tripDays = new Set<string>();
  const tripStartByKey = new Map<string, CalendarTripLeg>();
  for (const leg of tripLegs) {
    if (!leg.startsOn || !leg.endsOn) continue;
    for (const k of eachDayKey(leg.startsOn, leg.endsOn)) tripDays.add(k);
    tripStartByKey.set(leg.startsOn, leg);
  }

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
            onClick={() => {
              setNewDate(null);
              setShowNew(true);
            }}
            className="rounded-full bg-brand-mustard px-3 py-1.5 text-sm font-medium text-brand-charcoal"
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
              const dayFlash = flashByDate[key] ?? [];
              const tripStart = tripStartByKey.get(key) ?? null;
              const isTripDay = tripDays.has(key);
              const markers: CellMarker[] = [
                ...(tripStart
                  ? [
                      {
                        k: "trip" as const,
                        id: tripStart.id,
                        label: tripStart.label,
                      },
                    ]
                  : []),
                ...dayEvents.map((ev) => ({ k: "booking" as const, ev })),
                ...dayFlash.map((f) => ({
                  k: "flash" as const,
                  id: f.id,
                  title: f.title,
                })),
              ];
              const shownMarkers = markers.slice(0, 3);
              const extraMarkers = markers.length - shownMarkers.length;

              // Border logic: only EMIT `border-r`/`border-b` for cells that
              // need them. Setting `border-r-0`/`border-b-0` on the last
              // column / row doesn't work — globals.css `.border-r:not(.border-transparent)`
              // has higher specificity (`:not()` bumps to (0,2,0)) than the
              // `.border-r-0` utility (0,1,0), so the override loses. The
              // resulting unwanted right + bottom borders on edge cells were
              // visible as a double line + rounded-corner mismatch against the
              // outer container's border.
              const isPastOrToday = key <= TODAY;
              return (
                <div
                  key={i}
                  className={`group relative min-h-[96px] p-1.5 border-border ${
                    isTripDay
                      ? "bg-brand-cobalt/[0.08]"
                      : !isCurrentMonth
                        ? "bg-brand-mustard/[0.04]"
                        : ""
                  } ${i % 7 !== 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""}`}
                >
                  {/* Background click target — clicking anywhere on the cell
                      (except an event button) opens the add-appointment modal
                      pre-filled with this date. */}
                  <button
                    type="button"
                    onClick={() => {
                      // Past/today dates open the modal with no default — the
                      // input's `min={tomorrow()}` would otherwise leave the
                      // form in an invalid state.
                      setNewDate(isPastOrToday ? null : key);
                      setShowNew(true);
                    }}
                    aria-label={`Add appointment on ${date.toLocaleDateString()}`}
                    className="absolute inset-0 z-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-mustard focus-visible:ring-inset"
                  />

                  {/* Hover hint — desktop only; touch users tap the cell directly. */}
                  <Plus
                    aria-hidden
                    className="pointer-events-none absolute right-1.5 top-1.5 z-10 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70"
                  />

                  <span
                    className={`pointer-events-none relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs mb-1 ${
                      isToday
                        ? "bg-brand-mustard text-brand-charcoal font-semibold"
                        : isCurrentMonth
                          ? "text-muted-foreground"
                          : "text-muted-foreground/45"
                    }`}
                  >
                    {date.getDate()}
                  </span>

                  <div className="relative z-10 space-y-0.5">
                    {shownMarkers.map((m) => {
                      if (m.k === "booking") {
                        return (
                          <button
                            key={`b-${m.ev.id}`}
                            onClick={() => setSelected(m.ev)}
                            className={`w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs font-medium transition-opacity hover:opacity-80 ${
                              m.ev.origin === "artist_created"
                                ? "bg-[color:var(--color-tint-mustard)] text-brand-charcoal"
                                : "bg-[color:var(--color-tint-rosa)] text-brand-charcoal"
                            }`}
                          >
                            @{m.ev.handle}
                          </button>
                        );
                      }
                      if (m.k === "flash") {
                        return (
                          <Link
                            key={`f-${m.id}`}
                            href={`/flash/days/${m.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate rounded-md bg-[color:var(--color-tint-green)] px-1.5 py-0.5 text-xs font-medium text-brand-charcoal transition-opacity hover:opacity-80"
                          >
                            {m.title}
                          </Link>
                        );
                      }
                      return (
                        <Link
                          key={`t-${m.id}`}
                          href="/travel"
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate rounded-md bg-[color:var(--color-tint-cobalt)] px-1.5 py-0.5 text-xs font-medium text-brand-charcoal transition-opacity hover:opacity-80"
                        >
                          {m.label}
                        </Link>
                      );
                    })}
                    {extraMarkers > 0 && (
                      <p className="text-xs text-muted-foreground px-1">
                        +{extraMarkers} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-tint-rosa)]" />
            Booking request
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-tint-mustard)]" />
            Added by you
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-tint-cobalt)]" />
            Guest spot
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-tint-green)]" />
            Flash day
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

      {showNew && (
        <NewAppointmentModal
          defaultDate={newDate}
          onClose={() => {
            setShowNew(false);
            setNewDate(null);
          }}
        />
      )}
    </>
  );
}
