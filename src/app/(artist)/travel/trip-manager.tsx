"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import Spinner from "@/components/spinner";
import DateInput from "@/components/date-input";
import {
  createTripAction,
  updateTripAction,
  deleteTripAction,
  toggleTripVisibilityAction,
  createTripLegAction,
  deleteTripLegAction,
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

// ─── Modal shell ──────────────────────────────────────────────────────────────

function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-md border-2 border-border bg-background">
        {children}
      </div>
    </div>
  );
}

// ─── Create trip modal ────────────────────────────────────────────────────────

type PendingStop = {
  id: string;
  startsOn: string;
  endsOn: string;
  studioId: string;
  notes: string;
};

function CreateTripModal({
  onClose,
  studios,
}: {
  onClose: () => void;
  studios: Studio[];
}) {
  const [show, setShow] = useState(true);
  const [stops, setStops] = useState<PendingStop[]>([]);
  const [addingStop, setAddingStop] = useState(false);
  const [stopFrom, setStopFrom] = useState("");
  const [stopTo, setStopTo] = useState("");
  const [stopStudio, setStopStudio] = useState("");
  const [stopNotes, setStopNotes] = useState("");

  const [state, action, pending] = useActionState<State, FormData>(
    createTripAction,
    null,
  );
  const prevState = useRef(state);
  useEffect(() => {
    if (prevState.current !== state && state && "success" in state) {
      startTransition(onClose);
    }
    prevState.current = state;
  }, [state, onClose]);

  function confirmStop() {
    if (!stopFrom || !stopTo) return;
    setStops((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        startsOn: stopFrom,
        endsOn: stopTo,
        studioId: stopStudio,
        notes: stopNotes,
      },
    ]);
    setStopFrom("");
    setStopTo("");
    setStopStudio("");
    setStopNotes("");
    setAddingStop(false);
  }

  function removeStop(id: string) {
    setStops((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">New trip</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Title</label>
          <input
            name="title"
            type="text"
            required
            placeholder="e.g. Berlin guest spot"
            className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Description{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <textarea
            name="description"
            rows={2}
            placeholder="Briefly describe this trip or guest spot."
            className="w-full resize-none rounded-md border-2 border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Stops on your trip */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground border-b border-border pb-1.5">
            Stops on your trip
          </h3>

          {stops.length > 0 && (
            <div className="divide-y divide-border rounded-md border-2 border-border">
              {stops.map((stop) => (
                <div
                  key={stop.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm text-foreground">
                      {formatDate(stop.startsOn)} — {formatDate(stop.endsOn)}
                    </p>
                    {stop.studioId && studios.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {studios.find((s) => s.id === stop.studioId)?.name}
                      </p>
                    )}
                    {stop.notes && (
                      <p className="text-sm text-muted-foreground italic">
                        {stop.notes}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStop(stop.id)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingStop ? (
            <div className="space-y-3 rounded-md border-2 border-border px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">From</label>
                  <DateInput
                    value={stopFrom}
                    onChange={(e) => setStopFrom(e.target.value)}
                    className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">To</label>
                  <DateInput
                    value={stopTo}
                    onChange={(e) => setStopTo(e.target.value)}
                    className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              {studios.length > 0 && (
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">
                    Studio{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <select
                    value={stopStudio}
                    onChange={(e) => setStopStudio(e.target.value)}
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
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="text"
                  value={stopNotes}
                  onChange={(e) => setStopNotes(e.target.value)}
                  placeholder="e.g. walk-ins welcome"
                  className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmStop}
                  disabled={!stopFrom || !stopTo}
                  className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
                >
                  Add stop
                </button>
                <button
                  type="button"
                  onClick={() => setAddingStop(false)}
                  className="rounded-md border-2 border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingStop(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              + Add stop
            </button>
          )}
        </div>

        <input type="hidden" name="legs_json" value={JSON.stringify(stops)} />

        <div className="flex items-center justify-between rounded-md border-2 border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Show on booking form
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Clients can select this trip when booking.
            </p>
          </div>
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
          <input
            type="hidden"
            name="show_on_booking_form"
            value={String(show)}
          />
        </div>

        {state && "error" in state && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
          >
            {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Create trip"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border-2 border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Edit trip modal ──────────────────────────────────────────────────────────

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
  const [open, setOpen] = useState(false);
  const prevLegState = useRef(state);
  useEffect(() => {
    if (prevLegState.current !== state && state && "success" in state) {
      startTransition(() => setOpen(false));
    }
    prevLegState.current = state;
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        + Add stop
      </button>
    );
  }

  return (
    <form
      action={action}
      className="space-y-3 rounded-md border-2 border-border px-4 py-4"
    >
      <p className="text-sm font-medium text-foreground">Add stop</p>
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
            Studio <span className="text-muted-foreground">(optional)</span>
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
          Notes <span className="text-muted-foreground">(optional)</span>
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

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Add stop"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border-2 border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditTripModal({
  trip,
  studios,
  onClose,
}: {
  trip: Trip;
  studios: Studio[];
  onClose: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [show, setShow] = useState(trip.showOnBookingForm);
  const [deletingLeg, setDeletingLeg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editState, editAction, editPending] = useActionState<State, FormData>(
    updateTripAction,
    null,
  );
  const prevEditState = useRef(editState);
  useEffect(() => {
    if (
      prevEditState.current !== editState &&
      editState &&
      "success" in editState
    ) {
      startTransition(onClose);
    }
    prevEditState.current = editState;
  }, [editState, onClose]);

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
    setDeleting(true);
    startTransition(async () => {
      await deleteTripAction(trip.id);
      onClose();
    });
  }

  function handleToggleVisibility() {
    const next = !show;
    setShow(next);
    startTransition(async () => {
      await toggleTripVisibilityAction(trip.id, next);
    });
  }

  return (
    <div className="px-6 py-5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Edit trip</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Edit form — no submit button here; button lives at the bottom */}
      <form id="edit-trip-form" action={editAction} className="space-y-4">
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
            <span className="font-normal text-muted-foreground">
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
            onClick={handleToggleVisibility}
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
          <input
            type="hidden"
            name="show_on_booking_form"
            value={String(show)}
          />
        </div>
      </form>

      {/* Stops */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground border-b border-border pb-1.5">
          Stops on your trip
        </h3>

        {trip.legs.length > 0 && (
          <div className="divide-y divide-border rounded-md border-2 border-border">
            {trip.legs.map((leg) => {
              const legActive = leg.startsOn <= today && leg.endsOn >= today;
              return (
                <div
                  key={leg.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground">
                        {formatDate(leg.startsOn)} — {formatDate(leg.endsOn)}
                      </p>
                      {legActive && (
                        <span className="text-xs text-green-500">Now</span>
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

        {trip.legs.length === 0 && (
          <p className="text-sm text-muted-foreground">No stops yet.</p>
        )}

        <AddLegForm tripId={trip.id} studios={studios} />
      </div>

      {/* Bottom actions */}
      {editState && "error" in editState && (
        <p className="text-sm text-destructive">{editState.error}</p>
      )}

      <div className="pt-2 border-t border-border flex items-center justify-between">
        <button
          type="button"
          disabled={deleting}
          onClick={handleDeleteTrip}
          className="text-sm text-destructive hover:opacity-70 transition-opacity disabled:opacity-40"
        >
          {deleting ? "Deleting…" : "Delete trip"}
        </button>
        <button
          type="submit"
          form="edit-trip-form"
          disabled={editPending || deleting}
          className="rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {editPending ? (
            <Spinner className="mx-auto h-4 w-4" />
          ) : (
            "Save changes"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Condensed trip card ──────────────────────────────────────────────────────

function TripSummaryCard({
  trip,
  onClick,
}: {
  trip: Trip;
  onClick: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const isActive = trip.legs.some(
    (l) => l.startsOn <= today && l.endsOn >= today,
  );
  const isUpcoming = !isActive && trip.legs.some((l) => l.startsOn > today);

  const dateRange =
    trip.legs.length > 0
      ? `${formatDate(trip.legs[0].startsOn)}${trip.legs.length > 1 ? ` + ${trip.legs.length - 1} more` : ""}`
      : "No dates";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-md border-2 border-border px-5 py-4 hover:border-foreground/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">
              {trip.title}
            </span>
            {isActive && (
              <span className="text-xs text-green-500 font-medium">Active</span>
            )}
            {isUpcoming && (
              <span className="text-xs text-muted-foreground">Upcoming</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{dateRange}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-xs font-medium ${trip.showOnBookingForm ? "text-foreground" : "text-muted-foreground"}`}
          >
            {trip.showOnBookingForm ? "On form" : "Hidden"}
          </span>
          <span className="text-xs text-muted-foreground">→</span>
        </div>
      </div>
    </button>
  );
}

// ─── Main manager ─────────────────────────────────────────────────────────────

type ModalState =
  | { type: "none" }
  | { type: "create" }
  | { type: "edit"; tripId: string };

export default function TripManager({
  trips,
  studios,
}: {
  trips: Trip[];
  studios: Studio[];
}) {
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  function closeModal() {
    setModal({ type: "none" });
  }

  // Derive the current trip from props so the modal always reflects latest server data
  const editTrip =
    modal.type === "edit"
      ? (trips.find((t) => t.id === modal.tripId) ?? null)
      : null;

  return (
    <>
      <div className="space-y-3">
        {/* New trip card */}
        <button
          type="button"
          onClick={() => setModal({ type: "create" })}
          className="w-full text-left rounded-md border-2 border-dashed border-border px-5 py-4 hover:border-foreground/40 transition-colors text-sm text-muted-foreground hover:text-foreground"
        >
          New trip →
        </button>

        {/* Existing trips */}
        {trips.map((trip) => (
          <TripSummaryCard
            key={trip.id}
            trip={trip}
            onClick={() => setModal({ type: "edit", tripId: trip.id })}
          />
        ))}

        {trips.length === 0 && (
          <p className="text-sm text-muted-foreground px-1">
            No trips yet — click the card above to create your first one.
          </p>
        )}
      </div>

      {modal.type === "create" && (
        <Modal onClose={closeModal}>
          <CreateTripModal onClose={closeModal} studios={studios} />
        </Modal>
      )}

      {modal.type === "edit" && editTrip && (
        <Modal onClose={closeModal}>
          <EditTripModal
            trip={editTrip}
            studios={studios}
            onClose={closeModal}
          />
        </Modal>
      )}
    </>
  );
}
