"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";

/** The shared "done" badge: a filled mustard circle with a charcoal check. */
export function CheckBadge({ className }: { className?: string }) {
  return (
    <span
      aria-label="Done"
      className={`pointer-events-none inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-mustard ${className ?? ""}`}
    >
      <Check className="h-3 w-3 text-brand-charcoal" strokeWidth={3.5} />
    </span>
  );
}

/**
 * Wraps one field area of the booking form. Once focus leaves the area and its
 * requirement is satisfied (every control valid AND at least one filled), it
 * fades to a confirmed "done" state and nudges the page on to the next area by
 * one area height + the inter-area gap. The per-control checkmark lives INSIDE
 * each control (see CheckBadge usages in the forms) for clear placement.
 */
export default function FieldArea({
  gap = 32,
  children,
}: {
  gap?: number;
  children: React.ReactNode;
}) {
  const [done, setDone] = useState(false);
  const scrolledOnce = useRef(false);

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.contains(e.relatedTarget as Node | null)) return;
    const controls = el.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea");
    let anyFilled = false;
    let allValid = true;
    controls.forEach((c) => {
      if ((c as HTMLInputElement).type === "hidden") return;
      if (!c.checkValidity()) allValid = false;
      if (typeof c.value === "string" && c.value.trim() !== "")
        anyFilled = true;
    });
    if (allValid && anyFilled) {
      setDone(true);
      if (!scrolledOnce.current) {
        scrolledOnce.current = true;
        window.scrollBy({ top: el.offsetHeight + gap, behavior: "smooth" });
      }
    }
  };

  return (
    <div
      onBlur={handleBlur}
      onFocus={() => setDone(false)}
      className={`transition-opacity ${done ? "opacity-60" : ""}`}
    >
      {children}
    </div>
  );
}
