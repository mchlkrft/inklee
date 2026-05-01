"use client";

import DateInput from "@/components/date-input";
import { useActionState, useState, startTransition } from "react";
import { saveAvailabilityAction, toggleBooksOpenAction } from "./actions";
import Spinner from "@/components/spinner";
import type { BooksSettings } from "@/lib/books-settings";

type State = { error: string } | { success: true } | null;

export default function AvailabilityForm({
  settings,
  windowExpired,
}: {
  settings: BooksSettings;
  windowExpired: boolean;
}) {
  const [booksOpen, setBooksOpen] = useState(settings.books_open);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [message, setMessage] = useState(settings.books_closed_message ?? "");
  const [state, action, pending] = useActionState<State, FormData>(
    saveAvailabilityAction,
    null,
  );

  const isOpen = booksOpen && !windowExpired;

  function handleToggle() {
    const newValue = !booksOpen;
    setBooksOpen(newValue);
    setToggling(true);
    setToggleError(null);
    startTransition(async () => {
      const result = await toggleBooksOpenAction(newValue);
      setToggling(false);
      if ("error" in result) {
        setBooksOpen(!newValue);
        setToggleError(result.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Immediate-save toggle with inline status badge */}
      <div className="flex items-center justify-between rounded-md border-2 border-border px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              Accept booking requests
            </p>
            <span
              className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                isOpen
                  ? "bg-green-500/10 text-green-500"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isOpen ? "Open" : "Closed"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            When off, your booking page shows a closed message and waitlist
            form.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={booksOpen}
          onClick={handleToggle}
          disabled={toggling}
          className={`ml-4 relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
            booksOpen ? "bg-foreground" : "bg-border"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
              booksOpen ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {toggleError && <p className="text-sm text-destructive">{toggleError}</p>}

      {/* Remaining settings — cap, window, closed message */}
      <form action={action} className="space-y-5">
        <div className="space-y-1.5">
          <label
            htmlFor="booking_cap"
            className="text-sm font-medium text-foreground"
          >
            Booking cap{" "}
            <span className="text-sm text-muted-foreground">(optional)</span>
          </label>
          <input
            id="booking_cap"
            name="booking_cap"
            type="number"
            min="1"
            step="1"
            defaultValue={settings.booking_cap ?? ""}
            placeholder="e.g. 20 — auto-closes when reached"
            className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-sm text-muted-foreground">
            Counts pending, approved, and deposit-pending requests.
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="booking_window_ends_at"
            className="text-sm font-medium text-foreground"
          >
            Close books on{" "}
            <span className="text-sm text-muted-foreground">(optional)</span>
          </label>
          <DateInput
            id="booking_window_ends_at"
            name="booking_window_ends_at"
            defaultValue={settings.booking_window_ends_at ?? ""}
            className="w-full rounded-md border-2 border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-sm text-muted-foreground">
            Books auto-close at midnight on this date.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <label
              htmlFor="books_closed_message"
              className="text-sm font-medium text-foreground"
            >
              Closed message{" "}
              <span className="text-sm text-muted-foreground">(optional)</span>
            </label>
            <span
              className={`text-sm ${message.length > 280 ? "text-destructive" : "text-muted-foreground"}`}
            >
              {message.length}/280
            </span>
          </div>
          <textarea
            id="books_closed_message"
            name="books_closed_message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Books are currently closed. Check back soon."
            className="w-full resize-none rounded-md border-2 border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-sm text-muted-foreground">
            Shown on your public page when books are closed or full.
          </p>
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
    </div>
  );
}
