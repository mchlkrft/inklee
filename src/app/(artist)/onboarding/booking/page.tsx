"use client";

import { useActionState } from "react";
import { saveOnboardingBookingAction } from "./actions";
import OnboardingProgress from "@/components/onboarding-progress";
import Link from "next/link";

type State = { error: string } | null;

export default function OnboardingBookingPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    saveOnboardingBookingAction,
    null,
  );

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
