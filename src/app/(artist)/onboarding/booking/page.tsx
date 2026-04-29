"use client";

import { useActionState, useState } from "react";
import { saveOnboardingBookingAction } from "./actions";
import OnboardingProgress from "@/components/onboarding-progress";
import { CalendarDays, Clock } from "lucide-react";

type State = { error: string } | null;

const MODES = [
  {
    value: "preferred_date",
    icon: CalendarDays,
    title: "Preferred date",
    desc: "Clients suggest a date. You review and approve each request. Best for open booking.",
  },
  {
    value: "fixed_slots",
    icon: Clock,
    title: "Fixed slots",
    desc: "You publish specific time slots and clients pick one. Best for booking rounds.",
  },
] as const;

export default function OnboardingBookingPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    saveOnboardingBookingAction,
    null,
  );
  const [selectedMode, setSelectedMode] = useState<
    "preferred_date" | "fixed_slots"
  >("preferred_date");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Booking mode</h1>
        <p className="text-sm text-muted-foreground">
          How do you want clients to request appointments?
        </p>
      </div>

      <OnboardingProgress current={2} />

      <form action={action} className="space-y-4">
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="space-y-2">
          {MODES.map(({ value, icon: Icon, title, desc }) => {
            const active = selectedMode === value;
            return (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-4 transition-colors ${
                  active
                    ? "border-foreground bg-muted/20"
                    : "border-border hover:border-foreground/40"
                }`}
              >
                <input
                  type="radio"
                  name="booking_mode"
                  value={value}
                  checked={active}
                  onChange={() => setSelectedMode(value)}
                  className="sr-only"
                />
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`}
                />
                <div>
                  <p
                    className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {title}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {desc}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {selectedMode === "fixed_slots" && (
          <div className="flex items-start gap-2.5 rounded-md border border-orange-400/40 bg-orange-400/5 px-4 py-3">
            <span className="mt-0.5 shrink-0 text-sm text-orange-400">⚠</span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-orange-400">
                Your booking page will be closed until you publish slots
              </p>
              <p className="text-xs text-orange-400/80">
                After setup, go to <strong>Bookings → Booking Settings</strong>{" "}
                to add your first time slots before sharing your link.
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? "Saving…" : "Continue →"}
        </button>
      </form>
    </div>
  );
}
