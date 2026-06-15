"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Check } from "lucide-react";
import { localDateKey } from "@/lib/date-utils";

const DAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
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
  const startOffset = (first.getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: Date[] = [];
  for (let i = startOffset; i > 0; i--) grid.push(new Date(year, month, 1 - i));
  for (let i = 1; i <= daysInMonth; i++) grid.push(new Date(year, month, i));
  let next = 1;
  while (grid.length < 42) grid.push(new Date(year, month + 1, next++));
  return grid;
}

function parseKey(key: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}

function formatDisplay(key: string): string {
  const p = parseKey(key);
  if (!p) return "";
  return new Date(p.y, p.m, p.d).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const DEFAULT_TRIGGER =
  "w-full rounded-md border border-border bg-background px-3 py-3 text-base focus:outline-none focus:ring-1 focus:ring-ring";

type Props = {
  name?: string;
  id?: string;
  required?: boolean;
  min?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string } }) => void;
  className?: string;
  placeholder?: string;
};

/**
 * Brand-styled date picker used everywhere a date is chosen (public booking
 * forms + artist tools). Replaces the native <input type="date"> popup — which
 * is browser chrome and can't be themed — with a custom popover matching the
 * brand (bone surface, mustard selected day, rounded). Keeps a native-input-
 * compatible API (value / defaultValue / onChange(e) / name / min / required),
 * so existing call sites work unchanged. Submits the ISO value via an sr-only
 * field named `name`. Opens below by default, flips above when short on room.
 */
export default function DateInput({
  name,
  id,
  required,
  min,
  value: controlled,
  defaultValue,
  onChange,
  className,
  placeholder = "Select a date",
}: Props) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const value = controlled ?? internal;
  const setValue = (v: string) => {
    if (controlled === undefined) setInternal(v);
    onChange?.({ target: { value: v } });
  };

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const now = new Date();
  const initial = parseKey(value) ?? parseKey(min ?? "");
  const [viewY, setViewY] = useState(initial?.y ?? now.getFullYear());
  const [viewM, setViewM] = useState(initial?.m ?? now.getMonth());

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grid = buildMonthGrid(viewY, viewM);
  const todayKey = localDateKey();

  const prevMonth = () => {
    if (viewM === 0) {
      setViewY((y) => y - 1);
      setViewM(11);
    } else {
      setViewM((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (viewM === 11) {
      setViewY((y) => y + 1);
      setViewM(0);
    } else {
      setViewM((m) => m + 1);
    }
  };

  const pick = (d: Date) => {
    const key = localDateKey(d);
    if (min && key < min) return;
    setValue(key);
    setOpen(false);
  };

  const POPOVER_H = 360;
  const toggle = () => {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const spaceBelow = window.innerHeight - rect.bottom;
        setOpenUp(spaceBelow < POPOVER_H && rect.top > spaceBelow);
      }
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        name={name}
        value={value}
        required={required}
        readOnly
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      />
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={toggle}
        className={`flex items-center justify-between gap-2 text-left ${className ?? DEFAULT_TRIGGER}`}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {value && (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-mustard">
              <Check
                className="h-3 w-3 text-brand-charcoal"
                strokeWidth={3.5}
              />
            </span>
          )}
          <CalendarDays
            className="h-4 w-4 text-muted-foreground"
            strokeWidth={1.8}
          />
        </span>
      </button>

      {open && (
        <div
          className={`absolute left-0 z-30 w-[19rem] max-w-[calc(100vw-3rem)] rounded-[20px] border border-border bg-background p-3 shadow-lg ${
            openUp ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-foreground">
              {MONTH_NAMES[viewM]} {viewY}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                aria-label="Previous month"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-[color:var(--color-workspace-hover)] hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                aria-label="Next month"
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-[color:var(--color-workspace-hover)] hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {grid.map((date, i) => {
              const key = localDateKey(date);
              const inMonth = date.getMonth() === viewM;
              const disabled = min ? key < min : false;
              const selected = key === value;
              const isToday = key === todayKey;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(date)}
                  className={`flex h-9 items-center justify-center rounded-full text-sm transition-colors disabled:cursor-not-allowed ${
                    selected
                      ? "bg-brand-mustard font-semibold text-brand-charcoal"
                      : disabled
                        ? "text-muted-foreground/30"
                        : inMonth
                          ? "text-foreground hover:bg-[color:var(--color-workspace-hover)]"
                          : "text-muted-foreground/45 hover:bg-[color:var(--color-workspace-hover)]"
                  } ${isToday && !selected ? "ring-1 ring-inset ring-brand-mustard/60" : ""}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
