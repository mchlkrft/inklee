"use client";

import { useEffect, useState } from "react";
import { Plane, X, MapPin } from "lucide-react";

type Leg = { startsOn: string; endsOn: string; locationLabel: string | null };
type Trip = { id: string; title: string; legs: Leg[] };

function fmt(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/**
 * Header travel card — a small button that opens a popover listing the artist's
 * public upcoming trips (each leg as "dates · location"). Mirrors the goods
 * card's placement + styling in the header.
 */
export default function TravelCard({ trips }: { trips: Trip[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (trips.length === 0) return null;

  // Flatten to legs, earliest first — a clean "where I'll be next" list.
  const stops = trips
    .flatMap((t) => t.legs.map((l) => ({ ...l, title: t.title })))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-brand-bone/25 bg-brand-bone/10 px-4 py-2 text-sm font-medium text-brand-bone transition-colors hover:bg-brand-bone/20"
      >
        <Plane className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        Upcoming trips
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Upcoming trips"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-charcoal/40 p-4 backdrop-blur-sm sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-12 w-full max-w-sm overflow-hidden rounded-[20px] border border-brand-charcoal/10 bg-brand-bone text-left text-brand-charcoal shadow-xl sm:mt-0"
          >
            <div className="flex items-center justify-between border-b border-brand-charcoal/10 px-5 py-4">
              <h2 className="text-base font-semibold">Upcoming trips</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-brand-charcoal/50 transition-colors hover:text-brand-charcoal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="divide-y divide-brand-charcoal/10">
              {stops.map((s, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3.5">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-brand-charcoal/40"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {fmt(s.startsOn)} to {fmt(s.endsOn)}
                    </p>
                    {s.locationLabel && (
                      <p className="text-sm text-brand-charcoal/60">
                        {s.locationLabel}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
