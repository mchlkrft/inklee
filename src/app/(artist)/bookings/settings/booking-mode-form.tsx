"use client";

import { useState, startTransition, useRef } from "react";
import Spinner from "@/components/spinner";
import { saveBookingModeAction, skipSlotSetupAction } from "./actions";
import SlotPatternBuilder from "../slots/slot-pattern-builder";

const MODES = [
  {
    value: "preferred_date",
    label: "Preferred date",
    description: "Clients suggest a date. You confirm or negotiate.",
  },
  {
    value: "fixed_slots",
    label: "Fixed slots",
    description: "You publish specific time slots. Clients pick one.",
  },
] as const;

export default function BookingModeForm({
  currentMode,
  timezone,
}: {
  currentMode: string;
  timezone: string;
}) {
  const [selected, setSelected] = useState(currentMode);
  const [savedMode, setSavedMode] = useState(currentMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [skipping, setSkipping] = useState(false);

  // Capture savedMode at submit time to avoid stale-closure issues
  const savedModeAtSubmit = useRef(currentMode);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const prevSaved = savedModeAtSubmit.current;
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const result = await saveBookingModeAction(null, fd);
      setSaving(false);
      if (!result) return;
      if ("error" in result) {
        setError(result.error);
      } else {
        savedModeAtSubmit.current = selected;
        setSavedMode(selected);
        if (selected === "fixed_slots" && prevSaved !== "fixed_slots") {
          setModalOpen(true);
        }
      }
    });
  }

  async function handleSkip() {
    setSkipping(true);
    startTransition(async () => {
      await skipSlotSetupAction();
      setSkipping(false);
      setModalOpen(false);
    });
  }

  const changed = selected !== savedMode;

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => {
            const active = selected === m.value;
            return (
              <label
                key={m.value}
                className={`relative flex cursor-pointer flex-col gap-1 rounded-md border-2 px-4 py-3.5 transition-colors ${
                  active
                    ? "border-foreground bg-foreground/5"
                    : "border-border hover:border-foreground/40"
                }`}
              >
                <input
                  type="radio"
                  name="booking_mode"
                  value={m.value}
                  checked={active}
                  onChange={() => setSelected(m.value)}
                  className="sr-only"
                />
                <span
                  className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {m.label}
                  {active && !changed && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      active
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {m.description}
                </span>
              </label>
            );
          })}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={saving || !changed}
          className="rounded-full bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {saving ? <Spinner className="mx-auto h-4 w-4" /> : "Save"}
        </button>
      </form>

      {/* Slot setup modal — opens once after switching to fixed_slots */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-xl border-2 border-border bg-background shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Set up your time slots
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Fixed slots mode is active. Add time slots now so clients can
                  start booking, or skip and set them up later.
                </p>
              </div>

              <SlotPatternBuilder
                timezone={timezone}
                onDone={() => setModalOpen(false)}
              />

              <div className="border-t border-border pt-3">
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={skipping}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {skipping
                    ? "Saving…"
                    : "Skip for now. I'll set up slots later"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
