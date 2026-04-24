"use client";

import { startTransition, useActionState, useState } from "react";
import Spinner from "@/components/spinner";
import DateInput from "@/components/date-input";
import {
  toggleTripVisibilityAction,
  deleteTripAction,
  createTripLegAction,
  deleteTripLegAction,
  updateTripAction,
} from "./actions";

type Studio = { id: string; name: string; city: string; country: string };
type TripLeg = {
  id: string;
  startsOn: string;
  endsOn: string;
  notes: string | null;
  studio: { id: string; name: string } | null;
};
type Trip = {
  id: string;
  title: string;
  description: string | null;
  showOnBookingForm: boolean;
  legs: TripLeg[];
};

type State = { error: string } | { success: true } | null;

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function AddLegForm({
  tripId,
  studios,
}: {
  tripId: string;
  studios: Studio[];
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    createTripLegAction,
    null,
  );

  return (
    <form action={action} className="space-y-3 pt-3 border-t border-border">
      <p className="text-sm font-medium text-foreground">Add date range</p>
      <input type="hidden" name="trip_id" value={tripId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">From</label>
          <DateInput
            name="starts_on"
            required
            className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">To</label>
          <DateInput
            name="ends_on"
            required
            className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {studios.length > 0 && (
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">
            Studio{" "}
            <span className="text-sm text-muted-foreground">(optional)</span>
          </label>
          <select
            name="studio_id"
            className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">None</option>
            {studios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.city}, {s.country}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">
          Notes{" "}
          <span className="text-sm text-muted-foreground">(optional)</span>
        </label>
        <input
          name="notes"
          type="text"
          placeholder="e.g. walk-ins welcome"
          className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md border-2 border-border px-4 py-2 text-sm text-foreground hover:border-foreground transition-colors disabled:opacity-50"
      >
        {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Add date range"}
      </button>
    </form>
  );
}

function EditTripForm({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const [state, action, pending] = useActionState<State, FormData>(
    updateTripAction,
    null,
  );
  const [show, setShow] = useState(trip.showOnBookingForm);

  if (state && "success" in state) onDone();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={trip.id} />

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Title</label>
        <input
          name="title"
          type="text"
          required
          defaultValue={trip.title}
          className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Description{" "}
          <span className="text-sm text-muted-foreground font-normal">
            (optional)
          </span>
        </label>
        <textarea
          name="description"
          rows={2}
          defaultValue={trip.description ?? ""}
          className="w-full resize-none rounded-md border-2 border-border bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex items-center justify-between rounded-md border-2 border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">
          Show on booking form
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={show}
          onClick={() => setShow((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            show ? "bg-foreground" : "bg-border"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
              show ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <input type="hidden" name="show_on_booking_form" value={String(show)} />
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md border-2 border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function TripCard({
  trip,
  studios,
}: {
  trip: Trip;
  studios: Studio[];
}) {
  const [showLegs, setShowLegs] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deletingLeg, setDeletingLeg] = useState<string | null>(null);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [visibility, setVisibility] = useState(trip.showOnBookingForm);

  function handleToggleVisibility() {
    const next = !visibility;
    setVisibility(next);
    startTransition(async () => {
      await toggleTripVisibilityAction(trip.id, next);
    });
  }

  function handleDeleteLeg(id: string) {
    setDeletingLeg(id);
    startTransition(async () => {
      await deleteTripLegAction(id);
      setDeletingLeg(null);
    });
  }

  function handleDeleteTrip() {
    if (!confirm("Delete this trip and all its dates? This cannot be undone."))
      return;
    setDeletingTrip(true);
    startTransition(async () => {
      await deleteTripAction(trip.id);
    });
  }

  const today = new Date().toISOString().split("T")[0];
  const isActive = trip.legs.some(
    (l) => l.startsOn <= today && l.endsOn >= today,
  );
  const isUpcoming = !isActive && trip.legs.some((l) => l.startsOn > today);

  return (
    <div
      className={`rounded-md border-2 border-border px-5 py-4 space-y-4 ${deletingTrip ? "opacity-50 pointer-events-none" : ""}`}
    >
      {/* Trip header */}
      {editing ? (
        <EditTripForm trip={trip} onDone={() => setEditing(false)} />
      ) : (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-foreground">
                  {trip.title}
                </h3>
                {isActive && (
                  <span className="text-xs text-green-500 font-medium">
                    Active
                  </span>
                )}
                {isUpcoming && (
                  <span className="text-xs text-muted-foreground">
                    Upcoming
                  </span>
                )}
              </div>
              {trip.description && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {trip.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Visibility toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={visibility}
                onClick={handleToggleVisibility}
                title={
                  visibility ? "Hide from booking form" : "Show on booking form"
                }
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  visibility ? "bg-foreground" : "bg-border"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${
                    visibility ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-xs text-muted-foreground">
                {visibility ? "On form" : "Hidden"}
              </span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleDeleteTrip}
                className="text-xs text-destructive hover:opacity-80 transition-opacity"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legs list */}
      {!editing && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowLegs((v) => !v)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {trip.legs.length === 0
              ? "No dates yet"
              : `${trip.legs.length} date ${trip.legs.length === 1 ? "range" : "ranges"}`}{" "}
            {showLegs ? "▲" : "▼"}
          </button>

          {showLegs && (
            <div className="space-y-3">
              {trip.legs.length > 0 && (
                <div className="rounded-md border-2 border-border divide-y divide-border">
                  {trip.legs.map((leg) => {
                    const legActive =
                      leg.startsOn <= today && leg.endsOn >= today;
                    return (
                      <div
                        key={leg.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-foreground">
                              {formatDate(leg.startsOn)} —{" "}
                              {formatDate(leg.endsOn)}
                            </p>
                            {legActive && (
                              <span className="text-xs text-green-500">
                                Now
                              </span>
                            )}
                          </div>
                          {leg.studio && (
                            <p className="text-sm text-muted-foreground">
                              {leg.studio.name}
                            </p>
                          )}
                          {leg.notes && (
                            <p className="text-sm text-muted-foreground italic">
                              {leg.notes}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={deletingLeg === leg.id}
                          onClick={() => handleDeleteLeg(leg.id)}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0 disabled:opacity-40"
                        >
                          {deletingLeg === leg.id ? "…" : "Remove"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <AddLegForm tripId={trip.id} studios={studios} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
