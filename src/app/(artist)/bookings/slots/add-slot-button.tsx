"use client";

import { useState } from "react";
import SlotPatternBuilder from "./slot-pattern-builder";

export default function AddSlotButton({ timezone }: { timezone: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md border-2 border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
      >
        + Add time slot
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border-2 border-border bg-background shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Add time slot
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Define one or more time windows and apply them to dates or
                    weekdays.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <SlotPatternBuilder
                timezone={timezone}
                onDone={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
