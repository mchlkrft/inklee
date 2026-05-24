"use client";

import { useActionState, useState } from "react";
import { saveOnboardingAvailabilityAction } from "./actions";
import OnboardingProgress from "@/components/onboarding-progress";
import Link from "next/link";
import { BookOpen, BookX } from "lucide-react";

type State = { error: string } | null;

export default function OnboardingAvailabilityPage() {
  const [state, action, pending] = useActionState<State, FormData>(
    saveOnboardingAvailabilityAction,
    null,
  );
  const [booksOpen, setBooksOpen] = useState(true);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Availability
        </h1>
        <p className="text-sm text-muted-foreground">
          Should your booking page be open for requests right away?
        </p>
      </div>

      <OnboardingProgress current={3} />

      <form action={action} className="space-y-5">
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <input type="hidden" name="books_open" value={String(booksOpen)} />

        <div className="space-y-2">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-4 transition-colors ${
              booksOpen
                ? "border-foreground bg-muted/20"
                : "border-border hover:border-foreground/40"
            }`}
            onClick={() => setBooksOpen(true)}
          >
            <BookOpen
              className={`mt-0.5 h-4 w-4 shrink-0 ${booksOpen ? "text-foreground" : "text-muted-foreground"}`}
            />
            <div>
              <p
                className={`text-sm font-medium ${booksOpen ? "text-foreground" : "text-muted-foreground"}`}
              >
                Open for bookings
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                Clients can submit requests as soon as your link is live.
              </p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-4 transition-colors ${
              !booksOpen
                ? "border-foreground bg-muted/20"
                : "border-border hover:border-foreground/40"
            }`}
            onClick={() => setBooksOpen(false)}
          >
            <BookX
              className={`mt-0.5 h-4 w-4 shrink-0 ${!booksOpen ? "text-foreground" : "text-muted-foreground"}`}
            />
            <div>
              <p
                className={`text-sm font-medium ${!booksOpen ? "text-foreground" : "text-muted-foreground"}`}
              >
                Not yet, open later
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                Your page exists but clients cannot submit requests until you
                open it in settings.
              </p>
            </div>
          </label>
        </div>

        {!booksOpen && (
          <div className="space-y-1.5">
            <label
              htmlFor="books_closed_message"
              className="text-sm text-muted-foreground"
            >
              Closed message{" "}
              <span className="text-xs">(optional, shown to visitors)</span>
            </label>
            <input
              id="books_closed_message"
              name="books_closed_message"
              type="text"
              placeholder="e.g. Books opening soon. Check my Instagram for updates"
              maxLength={280}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
          >
            {pending ? "Saving…" : "Continue →"}
          </button>
          <Link
            href="/onboarding/form"
            className="rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </Link>
        </div>
      </form>
    </div>
  );
}
