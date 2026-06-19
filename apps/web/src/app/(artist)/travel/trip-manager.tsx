"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Spinner from "@/components/spinner";
import DateInput from "@/components/date-input";
import { formatDateKey, localDateKey } from "@/lib/date-utils";
import { rangesOverlap, legIsActive } from "@/lib/trip-validation";
import {
  createTripAction,
  updateTripAction,
  deleteTripAction,
  toggleTripVisibilityAction,
  createTripLegAction,
  deleteTripLegAction,
  createStudioAndReturnAction,
} from "./actions";
import type { PlaceResult } from "@/components/google-places-picker";
import { IconPickerGrid } from "./icon-picker";
import { TravelIcon } from "@/components/travel-icon";
import { MapPin } from "lucide-react";

const GooglePlacesPicker = dynamic(
  () => import("@/components/google-places-picker"),
  { ssr: false },
);

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

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
  icon?: string | null;
  iconColor?: string | null;
};
type State = { error: string } | { success: true } | null;

const INPUT_CLS =
  "w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function formatDate(dateKey: string) {
  return formatDateKey(dateKey);
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

// ─── Inline quick-add studio panel ────────────────────────────────────────────

function QuickAddStudio({
  onSaved,
  onCancel,
}: {
  onSaved: (studio: Studio) => void;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  const handlePlaceSelect = useCallback((p: PlaceResult) => {
    setPlace(p);
    if (p.name) setName(p.name);
    if (p.city) setCity(p.city);
    if (p.country) setCountry(p.country);
    if (p.formattedAddress) setAddress(p.formattedAddress);
  }, []);

  async function handleSave() {
    if (!name.trim()) {
      setError("Studio name is required");
      return;
    }
    setPending(true);
    setError(null);

    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("city", city.trim());
    fd.set("country", country.trim());
    fd.set("address", address.trim());
    if (place) {
      fd.set("google_place_id", place.placeId);
      fd.set("formatted_address", place.formattedAddress);
      fd.set("latitude", place.lat?.toString() ?? "");
      fd.set("longitude", place.lng?.toString() ?? "");
      fd.set("google_maps_url", place.mapsUrl ?? "");
    }
    fd.set("visibility_mode", "hidden");
    fd.set("is_primary", "false");

    const result = await createStudioAndReturnAction(fd);
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    onSaved(result.studio);
    setName("");
    setAddress("");
    setCity("");
    setCountry("");
    setPlace(null);
  }

  return (
    <div className="mt-2 rounded-md border-2 border-border bg-muted/20 px-4 py-4 space-y-3">
      <p className="text-sm font-medium text-foreground">Add new studio</p>
      <p className="text-xs text-muted-foreground">
        Saved to your studio library and selected for this stop.
      </p>

      <div className="space-y-3">
        {GOOGLE_API_KEY ? (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Search on Google Maps{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <GooglePlacesPicker
              apiKey={GOOGLE_API_KEY}
              onPlaceSelect={handlePlaceSelect}
              onClear={() => setPlace(null)}
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Studio name <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sacred Point Studio"
            className={INPUT_CLS}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Berlin"
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Country</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Germany"
              className={INPUT_CLS}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Address <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address"
            className={INPUT_CLS}
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="rounded-full bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
          >
            {pending ? <Spinner className="mx-auto h-4 w-4" /> : "Save studio"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border-2 border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Studio select with inline add ───────────────────────────────────────────

const ADD_NEW_SENTINEL = "__add_new__";

function StudioSelectWithAdd({
  studios,
  value,
  onChange,
  name,
  onNewStudio,
}: {
  studios: Studio[];
  value: string;
  onChange: (id: string) => void;
  name?: string;
  onNewStudio?: (studio: Studio) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === ADD_NEW_SENTINEL) {
      setShowAdd(true);
      // Keep current value, don't set sentinel as real selection
      return;
    }
    onChange(val);
  }

  function handleSaved(studio: Studio) {
    onNewStudio?.(studio);
    onChange(studio.id);
    setShowAdd(false);
  }

  return (
    <div>
      <select
        name={showAdd ? undefined : name}
        value={showAdd ? "" : value}
        onChange={handleChange}
        className={INPUT_CLS}
      >
        <option value="">None</option>
        {studios.length > 0 && (
          <optgroup label="Your studios">
            {studios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.city ? ` — ${s.city}` : ""}
                {s.country ? `, ${s.country}` : ""}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label=" ">
          <option value={ADD_NEW_SENTINEL}>+ Add studio</option>
        </optgroup>
      </select>
      {/* Hidden input carries the real value when QuickAddStudio is open */}
      {showAdd && name && <input type="hidden" name={name} value={value} />}
      {showAdd && (
        <QuickAddStudio
          onSaved={handleSaved}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

// rangesOverlap is single-sourced in @inklee/shared/trip-validation (D14):
// overlapping stops are allowed (an artist can work several studios at once),
// but the client can't tell which studio applies — so we warn the artist.
function OverlapNotice() {
  return (
    <div className="rounded-md border border-brand-mustard/40 bg-brand-mustard/[0.07] px-3 py-2.5">
      <p className="text-xs leading-snug text-foreground">
        <span className="font-semibold">These dates overlap.</span> That&apos;s
        fine if you&apos;re working more than one studio at once — but clients
        booking on those days will see every matching studio and be asked to
        wait for your confirmation. Remember to tell each client which studio to
        come to.
      </p>
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
  studios: initialStudios,
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
  // Studios list grows as artist adds new ones inline
  const [studios, setStudios] = useState<Studio[]>(initialStudios);

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

  function handleNewStudio(studio: Studio) {
    setStudios((prev) =>
      prev.some((s) => s.id === studio.id) ? prev : [...prev, studio],
    );
    setStopStudio(studio.id);
  }

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

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Icon</label>
          <IconPickerGrid />
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

          {rangesOverlap(stops) && <OverlapNotice />}

          {addingStop ? (
            <div className="space-y-3 rounded-md border-2 border-border px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">From</label>
                  <DateInput
                    value={stopFrom}
                    onChange={(e) => setStopFrom(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">To</label>
                  <DateInput
                    value={stopTo}
                    onChange={(e) => setStopTo(e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">
                  Studio{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <StudioSelectWithAdd
                  studios={studios}
                  value={stopStudio}
                  onChange={setStopStudio}
                  onNewStudio={handleNewStudio}
                />
              </div>

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
                  className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-40"
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
            className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
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
  studios: initialStudios,
}: {
  tripId: string;
  studios: Studio[];
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    createTripLegAction,
    null,
  );
  const [open, setOpen] = useState(false);
  const [studioId, setStudioId] = useState("");
  const [studios, setStudios] = useState<Studio[]>(initialStudios);

  const prevLegState = useRef(state);
  useEffect(() => {
    if (prevLegState.current !== state && state && "success" in state) {
      startTransition(() => {
        setOpen(false);
        setStudioId("");
      });
    }
    prevLegState.current = state;
  }, [state]);

  function handleNewStudio(studio: Studio) {
    setStudios((prev) =>
      prev.some((s) => s.id === studio.id) ? prev : [...prev, studio],
    );
    setStudioId(studio.id);
  }

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
          <DateInput name="starts_on" required className={INPUT_CLS} />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">To</label>
          <DateInput name="ends_on" required className={INPUT_CLS} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">
          Studio <span className="text-muted-foreground">(optional)</span>
        </label>
        <StudioSelectWithAdd
          studios={studios}
          value={studioId}
          onChange={setStudioId}
          name="studio_id"
          onNewStudio={handleNewStudio}
        />
      </div>

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
          className="rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
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
  const today = localDateKey();
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

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Icon</label>
          <IconPickerGrid
            initial={trip.icon ?? null}
            initialColor={trip.iconColor ?? null}
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
              const legActive = legIsActive(leg.startsOn, leg.endsOn, today);
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

        {rangesOverlap(trip.legs) && <OverlapNotice />}

        {trip.legs.length === 0 && (
          <p className="text-sm text-muted-foreground">No stops yet.</p>
        )}

        <AddLegForm tripId={trip.id} studios={studios} />
      </div>

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
          className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
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
  const today = localDateKey();
  const isActive = trip.legs.some((l) =>
    legIsActive(l.startsOn, l.endsOn, today),
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
            {trip.icon ? (
              <TravelIcon
                icon={trip.icon}
                fallback={MapPin}
                className="h-4 w-4 text-muted-foreground"
                color={trip.iconColor ?? undefined}
              />
            ) : null}
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

  const editTrip =
    modal.type === "edit"
      ? (trips.find((t) => t.id === modal.tripId) ?? null)
      : null;

  return (
    <>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setModal({ type: "create" })}
          className="w-full text-left rounded-md border-2 border-dashed border-border px-5 py-4 hover:border-foreground/40 transition-colors text-sm text-muted-foreground hover:text-foreground"
        >
          New trip →
        </button>

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
