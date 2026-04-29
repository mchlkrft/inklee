"use client";

import { useActionState, useState } from "react";
import Spinner from "@/components/spinner";
import { saveBookingModeAction } from "./actions";

type State = { error: string } | { success: true } | null;

const MODES = [
  {
    value: "preferred_date",
    label: "Preferred date",
    description: "Clients suggest a date — you confirm or negotiate.",
  },
  {
    value: "fixed_slots",
    label: "Fixed slots",
    description: "You publish specific time slots. Clients pick one.",
  },
] as const;

export default function BookingModeForm({
  currentMode,
}: {
  currentMode: string;
}) {
  const [selected, setSelected] = useState(currentMode);
  const [state, action, pending] = useActionState<State, FormData>(
    saveBookingModeAction,
    null,
  );

  return (
    <form action={action} className="space-y-3">
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
                {active && (
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

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Save"}
      </button>
    </form>
  );
}
