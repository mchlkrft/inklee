"use client";

import { useActionState, useState } from "react";
import { saveOnboardingBookingAction } from "./actions";
import OnboardingProgress from "@/components/onboarding-progress";
import Link from "next/link";

type State = { error: string } | null;

export default function OnboardingBookingPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    saveOnboardingBookingAction,
    null,
  );
  const [selectedMode, setSelectedMode] = useState("preferred_date");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Booking setup</h1>
        <p className="text-sm text-muted-foreground">
          How do you want clients to request appointments?
        </p>
      </div>

      <OnboardingProgress current={3} />

      <form action={action} className="space-y-4">
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="space-y-2">
          <label className="flex items-start gap-3 rounded-md border border-border p-4 cursor-pointer hover:border-foreground transition-colors has-[:checked]:border-foreground has-[:checked]:bg-muted/30">
            <input
              type="radio"
              name="booking_mode"
              value="preferred_date"
              defaultChecked
              className="mt-0.5 shrink-0"
              onChange={() => setSelectedMode("preferred_date")}
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                Preferred date
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Clients suggest a date — you review and approve each request.
                Best for open booking.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-border p-4 cursor-pointer hover:border-foreground transition-colors has-[:checked]:border-foreground has-[:checked]:bg-muted/30">
            <input
              type="radio"
              name="booking_mode"
              value="fixed_slots"
              className="mt-0.5 shrink-0"
              onChange={() => setSelectedMode("fixed_slots")}
            />
            <div>
              <p className="text-sm font-medium text-foreground">Fixed slots</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You publish specific time slots — clients pick one. Best for
                wave booking rounds.
              </p>
            </div>
          </label>
        </div>

        {selectedMode === "fixed_slots" && (
          <div className="rounded-md border border-orange-400/40 bg-orange-400/5 px-4 py-3 flex items-start gap-2.5">
            <span className="text-orange-400 text-base shrink-0 mt-0.5">⚠</span>
            <div className="space-y-1">
              <p className="text-sm text-orange-400 font-medium">
                Your booking page will be closed until you publish slots
              </p>
              <p className="text-xs text-orange-400/80">
                After finishing setup, go to <strong>Bookings → Slots</strong>{" "}
                to add your first time slots. Clients cannot book until at least
                one slot is published.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Saving…" : "Continue →"}
          </button>
          <Link
            href="/onboarding/done"
            className="rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </Link>
        </div>
      </form>
    </div>
  );
}
