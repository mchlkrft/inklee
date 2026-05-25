"use client";

import Link from "next/link";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

export type FilterOption = {
  label: string;
  value: string;
  href: string;
};

export type FilterGroup = {
  /** Optional heading shown above the chip row when expanded. */
  heading?: string;
  options: FilterOption[];
  activeValue: string;
  /** The value that means "no filter applied" — used to detect whether
   *  this group is "active" and should be summarised in the collapsed pill. */
  resetValue: string;
};

/**
 * Collapsible filter row.
 *
 * Renders nothing until the parent's `count` reaches `threshold` (default 8) —
 * the chips create visual noise on short lists. Above the threshold, the
 * default state is a single "Filter" pill that shows the current selection
 * when one is active; tapping it expands the chip rows inline.
 */
export default function FilterRow({
  count,
  threshold = 8,
  groups,
}: {
  count: number;
  threshold?: number;
  groups: FilterGroup[];
}) {
  const [open, setOpen] = useState(false);

  // Summary of active selections for the collapsed pill — only includes
  // groups where the active value differs from the reset value.
  const activeLabels = groups
    .map((g) => {
      if (g.activeValue === g.resetValue) return null;
      const found = g.options.find((o) => o.value === g.activeValue);
      return found ? found.label : null;
    })
    .filter((s): s is string => Boolean(s));

  // Hide the chip on short lists ONLY if no filter is currently active.
  // If the page was reached via a deep link with `?trip=…` or `?status=…`
  // (e.g. from the dashboard Guest Spots card), the user needs to see what
  // they're filtered to and how to clear it, regardless of list length.
  if (count < threshold && activeLabels.length === 0) return null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>Filter</span>
        {activeLabels.length > 0 && (
          <span className="text-foreground">· {activeLabels.join(" · ")}</span>
        )}
      </button>

      {open &&
        groups.map((group, gi) => (
          <div key={gi} className="space-y-1.5">
            {group.heading && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.heading}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((opt) => {
                const isActive = group.activeValue === opt.value;
                return (
                  <Link
                    key={opt.value}
                    href={opt.href}
                    className={`rounded-full px-3 py-1 text-sm transition-colors ${
                      isActive
                        ? "bg-brand-mustard text-brand-charcoal"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
