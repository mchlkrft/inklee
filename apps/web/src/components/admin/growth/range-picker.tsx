"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

const PRESETS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "This month", value: "month" },
  { label: "Last month", value: "prev-month" },
  { label: "All time", value: "all" },
];

/**
 * Shared cockpit date-range control: preset pills + a custom from/to pair.
 * State lives in the URL (?range= / ?from=&to=) so every cockpit tab keeps the
 * selection and links are shareable.
 */
export default function RangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("range") ?? "30";
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [customOpen, setCustomOpen] = useState(active === "custom");

  function apply(params: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {PRESETS.map((preset) => (
        <button
          key={preset.value}
          onClick={() => {
            setCustomOpen(false);
            apply({ range: preset.value, from: null, to: null });
          }}
          className={`rounded-full px-3 py-1 text-xs transition-colors ${
            active === preset.value
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {preset.label}
        </button>
      ))}
      <button
        onClick={() => setCustomOpen((open) => !open)}
        className={`rounded-full px-3 py-1 text-xs transition-colors ${
          active === "custom"
            ? "bg-foreground text-background"
            : "bg-muted text-muted-foreground hover:text-foreground"
        }`}
      >
        Custom
      </button>
      {customOpen && (
        <span className="flex items-center gap-1">
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            aria-label="From date"
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-label="To date"
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
          />
          <button
            onClick={() => {
              if (from && to && from <= to) {
                apply({ range: "custom", from, to });
              }
            }}
            disabled={!from || !to || from > to}
            className="rounded-full bg-brand-mustard px-3 py-1 text-xs font-medium text-brand-charcoal disabled:opacity-40"
          >
            Apply
          </button>
        </span>
      )}
    </div>
  );
}
