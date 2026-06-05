"use client";

import DateInput from "@/components/date-input";
import { useActionState, useState } from "react";
import { saveBooksSettingsAction } from "./actions";
import Spinner from "@/components/spinner";
import type { BooksSettings } from "@/lib/books-settings";

type State = { error: string } | { success: true } | null;

export default function BooksForm({ settings }: { settings: BooksSettings }) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveBooksSettingsAction,
    null,
  );

  const [booksOpen, setBooksOpen] = useState(settings.books_open);
  const [message, setMessage] = useState(settings.books_closed_message ?? "");

  return (
    <form action={action} className="space-y-6">
      <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
        <div>
          <p className="text-sm text-foreground">Accept booking requests</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            When off, your booking page shows a closed message and waitlist
            form.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={booksOpen}
          onClick={() => setBooksOpen((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            booksOpen ? "bg-foreground" : "bg-border"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
              booksOpen ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <input type="hidden" name="books_open" value={String(booksOpen)} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="booking_cap" className="text-sm text-muted-foreground">
          Booking cap{" "}
          <span className="text-xs text-muted-foreground">(optional)</span>
        </label>
        <input
          id="booking_cap"
          name="booking_cap"
          type="number"
          min="1"
          step="1"
          defaultValue={settings.booking_cap ?? ""}
          placeholder="e.g. 20 - auto-closes when reached"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Counts pending, approved, and deposit-pending requests.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="booking_window_ends_at"
          className="text-sm text-muted-foreground"
        >
          Close books on{" "}
          <span className="text-xs text-muted-foreground">(optional)</span>
        </label>
        <DateInput
          id="booking_window_ends_at"
          name="booking_window_ends_at"
          defaultValue={settings.booking_window_ends_at ?? ""}
          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Books auto-close at midnight on this date.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between">
          <label
            htmlFor="books_closed_message"
            className="text-sm text-muted-foreground"
          >
            Closed message{" "}
            <span className="text-xs text-muted-foreground">(optional)</span>
          </label>
          <span
            className={`text-xs ${message.length > 280 ? "text-destructive" : "text-muted-foreground"}`}
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
          className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
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
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Save"}
      </button>
    </form>
  );
}
