"use client";

import { useActionState, useState } from "react";
import Spinner from "@/components/spinner";
import { createTripAction } from "./actions";

type State = { error: string } | { success: true } | null;

export default function TripForm() {
  const [state, action, pending] = useActionState<State, FormData>(
    createTripAction,
    null,
  );
  const [showOnBookingForm, setShowOnBookingForm] = useState(true);

  return (
    <form
      action={action}
      className="space-y-4 rounded-md border-2 border-border px-5 py-5"
    >
      <p className="text-base font-semibold text-foreground">New trip</p>

      <div className="space-y-1.5">
        <label
          htmlFor="trip-title"
          className="text-sm font-medium text-foreground"
        >
          Title
        </label>
        <input
          id="trip-title"
          name="title"
          type="text"
          required
          placeholder="e.g. Berlin guest spot"
          className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="trip-description"
          className="text-sm font-medium text-foreground"
        >
          Description{" "}
          <span className="text-sm text-muted-foreground font-normal">
            (optional)
          </span>
        </label>
        <textarea
          id="trip-description"
          name="description"
          rows={2}
          placeholder="Briefly describe this trip or guest spot."
          className="w-full resize-none rounded-md border-2 border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex items-center justify-between rounded-md border-2 border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Show on booking form
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Clients can select this trip when submitting a request.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showOnBookingForm}
          onClick={() => setShowOnBookingForm((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            showOnBookingForm ? "bg-foreground" : "bg-border"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
              showOnBookingForm ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <input
          type="hidden"
          name="show_on_booking_form"
          value={String(showOnBookingForm)}
        />
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Create trip"}
      </button>
    </form>
  );
}
