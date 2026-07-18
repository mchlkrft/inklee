"use client";

import { localDateKey } from "@/lib/date-utils";
import { useState } from "react";
import { MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { TravelIcon } from "@/components/travel-icon";
import AppointmentDrawer, { type CalendarEvent } from "./appointment-drawer";
import { customerLabel } from "@/lib/booking-domain";
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
  /** Parent trip's library icon key; null = default MapPin. */
  icon?: string | null;
};
export type CalendarFlashDay = { id: string; date: string; title: string };
/** A pending guest spot request's asked-for range (marker only, never blocks). */
export type CalendarPendingRange = {
  id: string;
  startsOn: string;
  endsOn: string;
  label: string;
};

type CellMarker =
  | { k: "booking"; ev: CalendarEvent }
  | { k: "flash"; id: string; title: string }
  | { k: "pending"; id: string; title: string };

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
  pendingRanges = [],
}: {
  events: CalendarEvent[];
  tripLegs?: CalendarTripLeg[];
  flashDays?: CalendarFlashDay[];
  pendingRanges?: CalendarPendingRange[];
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  // Day key whose full entry list is shown in the "+N more" popover.
  const [dayDetail, setDayDetail] = useState<string | null>(null);
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

  // Trip legs render as a faint background band across their days plus a small
  // location label pinned bottom-left of each covered cell — deliberately NOT a
  // chip, so guest-spot days don't read like customer appointments. Overlapping
  // legs (an artist working several studios at once) stack their cities.
  const tripDays = new Set<string>();
  const tripLabelsByDay = new Map<string, string[]>();
  // First leg's chosen icon wins on days where multiple trips overlap (the
  // labels merge; one glyph leads them).
  const tripIconByDay = new Map<string, string>();
  for (const leg of tripLegs) {
    if (!leg.startsOn || !leg.endsOn) continue;
    for (const k of eachDayKey(leg.startsOn, leg.endsOn)) {
      tripDays.add(k);
      const labels = tripLabelsByDay.get(k) ?? [];
      if (leg.label && !labels.includes(leg.label)) labels.push(leg.label);
      tripLabelsByDay.set(k, labels);
      if (leg.icon && !tripIconByDay.has(k)) tripIconByDay.set(k, leg.icon);
    }
  }

  // Pending guest spot requests: one marker on the range's first day (a chip
  // on every day would drown real bookings), deduped per request per day.
  const pendingByDay = new Map<string, CalendarPendingRange[]>();
  for (const range of pendingRanges) {
    if (!range.startsOn) continue;
    const list = pendingByDay.get(range.startsOn) ?? [];
    list.push(range);
    pendingByDay.set(range.startsOn, list);
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
            className="rounded-full bg-brand-mustard px-4 py-1.5 text-sm font-medium text-brand-charcoal"
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
              const isTripDay = tripDays.has(key);
              const dayTripLabels = tripLabelsByDay.get(key) ?? [];
              const dayPending = pendingByDay.get(key) ?? [];
              const markers: CellMarker[] = [
                ...dayEvents.map((ev) => ({ k: "booking" as const, ev })),
                ...dayFlash.map((f) => ({
                  k: "flash" as const,
                  id: f.id,
                  title: f.title,
                })),
                ...dayPending.map((p) => ({
                  k: "pending" as const,
                  id: p.id,
                  title: p.label,
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
                  } ${i % 7 !== 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""} ${
                    isTripDay ? "pb-6" : ""
                  }`}
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
                            {customerLabel(m.ev.handle, m.ev.email)}
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
                      // Pending guest spot request: dashed outline, never a
                      // block; clicking opens the request.
                      return (
                        <Link
                          key={`p-${m.id}`}
                          href={`/travel/requests/${m.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate rounded-md border border-dashed border-brand-cobalt/70 px-1.5 py-0.5 text-xs font-medium text-brand-cobalt transition-opacity hover:opacity-80"
                        >
                          {m.title}
                        </Link>
                      );
                    })}
                    {extraMarkers > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDayDetail(key);
                        }}
                        className="block w-full rounded-md px-1 py-0.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-[color:var(--color-workspace-hover)] hover:text-foreground"
                      >
                        +{extraMarkers} more
                      </button>
                    )}
                  </div>

                  {/* Travel location(s) — small, bottom-left, not a chip. */}
                  {dayTripLabels.length > 0 && (
                    <div className="pointer-events-none absolute bottom-1 left-1.5 right-1.5 z-10 flex items-center gap-1 text-[10px] font-medium text-brand-cobalt">
                      <TravelIcon
                        icon={tripIconByDay.get(key) ?? null}
                        fallback={MapPin}
                        className="h-3 w-3 shrink-0"
                      />
                      <span className="truncate">
                        {dayTripLabels.join(" · ")}
                      </span>
                    </div>
                  )}
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
          {pendingRanges.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-brand-cobalt/70" />
              Guest spot asked
            </span>
          ) : null}
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

      {/* "+N more" day popover — lists every entry for the day so the artist
          can quick-check a busy day and jump straight into an appointment. */}
      {dayDetail &&
        (() => {
          const [dyy, dmm, ddd] = dayDetail.split("-").map(Number);
          const detailDate = new Date(dyy, dmm - 1, ddd);
          const dayBookings = byDate[dayDetail] ?? [];
          const dayFlashList = flashByDate[dayDetail] ?? [];
          const dayPendingList = pendingByDay.get(dayDetail) ?? [];
          const dayLabels = tripLabelsByDay.get(dayDetail) ?? [];
          return (
            <div
              onClick={() => setDayDetail(null)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-brand-charcoal/40 p-4 backdrop-blur-sm"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-xs overflow-hidden rounded-[20px] border border-border bg-background shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold text-foreground">
                    {detailDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDayDetail(null)}
                    aria-label="Close"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
                <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
                  {dayLabels.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-brand-cobalt">
                      <TravelIcon
                        icon={tripIconByDay.get(dayDetail) ?? null}
                        fallback={MapPin}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      <span>{dayLabels.join(" · ")}</span>
                    </div>
                  )}
                  {dayBookings.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => {
                        setSelected(ev);
                        setDayDetail(null);
                      }}
                      className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm font-medium transition-opacity hover:opacity-80 ${
                        ev.origin === "artist_created"
                          ? "bg-[color:var(--color-tint-mustard)] text-brand-charcoal"
                          : "bg-[color:var(--color-tint-rosa)] text-brand-charcoal"
                      }`}
                    >
                      {customerLabel(ev.handle, ev.email)}
                    </button>
                  ))}
                  {dayFlashList.map((f) => (
                    <Link
                      key={f.id}
                      href={`/flash/days/${f.id}`}
                      onClick={() => setDayDetail(null)}
                      className="block truncate rounded-md bg-[color:var(--color-tint-green)] px-3 py-2 text-sm font-medium text-brand-charcoal transition-opacity hover:opacity-80"
                    >
                      {f.title}
                    </Link>
                  ))}
                  {dayPendingList.map((p) => (
                    <Link
                      key={p.id}
                      href={`/travel/requests/${p.id}`}
                      onClick={() => setDayDetail(null)}
                      className="block truncate rounded-md border border-dashed border-brand-cobalt/70 px-3 py-2 text-sm font-medium text-brand-cobalt transition-opacity hover:opacity-80"
                    >
                      {p.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}
