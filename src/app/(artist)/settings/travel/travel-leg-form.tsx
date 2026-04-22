"use client";

import DateInput from "@/components/date-input";
import { useActionState } from "react";
import { createTravelLegAction } from "./actions";

type State = { error: string } | { success: true } | null;

export default function TravelLegForm() {
  const [state, action, pending] = useActionState<State, FormData>(
    createTravelLegAction,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="city" className="text-sm text-muted-foreground">
            City <span className="text-foreground">*</span>
          </label>
          <input
            id="city"
            name="city"
            type="text"
            required
            placeholder="Amsterdam"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="country" className="text-sm text-muted-foreground">
            Country <span className="text-foreground">*</span>
          </label>
          <input
            id="country"
            name="country"
            type="text"
            required
            placeholder="Netherlands"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="starts_on" className="text-sm text-muted-foreground">
            From <span className="text-foreground">*</span>
          </label>
          <DateInput
            id="starts_on"
            name="starts_on"
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ends_on" className="text-sm text-muted-foreground">
            To <span className="text-foreground">*</span>
          </label>
          <DateInput
            id="ends_on"
            name="ends_on"
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="studio_name" className="text-sm text-muted-foreground">
          Studio{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </label>
        <input
          id="studio_name"
          name="studio_name"
          type="text"
          placeholder="Tattooist Studio"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm text-muted-foreground">
          Description{" "}
          <span className="text-muted-foreground text-xs">
            (optional, max 500 chars)
          </span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          placeholder="Any context for customers"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">Leg added.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Adding..." : "Add leg"}
      </button>
    </form>
  );
}
