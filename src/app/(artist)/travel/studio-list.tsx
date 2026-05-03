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
import {
  createStudioAction,
  updateStudioAction,
  deleteStudioAction,
} from "./actions";
import { VISIBILITY_LABELS } from "@/lib/studio-validation";
import type { PlaceResult } from "@/components/google-places-picker";

const GooglePlacesPicker = dynamic(
  () => import("@/components/google-places-picker"),
  { ssr: false },
);

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

type Studio = {
  id: string;
  name: string;
  city: string;
  country: string;
  address: string | null;
  google_place_id: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  visibility_mode: string;
  public_note: string | null;
  is_primary: boolean;
};

type State = { error: string } | { success: true } | null;

const INPUT_CLS =
  "w-full rounded-md border-2 border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

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

function StudioForm({
  studio,
  action,
  pending,
  state,
  onCancel,
  submitLabel,
}: {
  studio?: Studio;
  action: (payload: FormData) => void;
  pending: boolean;
  state: State;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [city, setCity] = useState(studio?.city ?? "");
  const [country, setCountry] = useState(studio?.country ?? "");
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [isPrimary, setIsPrimary] = useState(studio?.is_primary ?? false);
  const [visibilityMode, setVisibilityMode] = useState(
    studio?.visibility_mode ?? "hidden",
  );

  const handlePlaceSelect = useCallback(
    (p: PlaceResult) => {
      setPlace(p);
      if (!city && p.city) setCity(p.city);
      if (!country && p.country) setCountry(p.country);
    },
    [city, country],
  );

  const handleClear = useCallback(() => {
    setPlace(null);
  }, []);

  return (
    <form action={action} className="space-y-5">
      {studio && <input type="hidden" name="id" value={studio.id} />}

      {/* Section 1: Basic info */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Studio info
        </p>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">
            Name <span className="text-destructive">*</span>
          </label>
          <input
            name="name"
            type="text"
            required
            defaultValue={studio?.name ?? ""}
            placeholder="e.g. Ink & Iron"
            className={INPUT_CLS}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">City</label>
            <input
              name="city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Berlin"
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Country</label>
            <input
              name="country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Germany"
              className={INPUT_CLS}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">
            Street address{" "}
            <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            name="address"
            type="text"
            defaultValue={studio?.address ?? ""}
            placeholder="Street address"
            className={INPUT_CLS}
          />
        </div>
      </div>

      {/* Section 2: Google location */}
      {GOOGLE_API_KEY && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Google location{" "}
            <span className="font-normal normal-case">(optional)</span>
          </p>
          <GooglePlacesPicker
            apiKey={GOOGLE_API_KEY}
            onPlaceSelect={handlePlaceSelect}
            onClear={handleClear}
          />
          {place && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                {place.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {place.formattedAddress}
              </p>
              {place.mapsUrl && (
                <a
                  href={place.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Open in Google Maps
                </a>
              )}
            </div>
          )}
          <input
            type="hidden"
            name="google_place_id"
            value={place?.placeId ?? studio?.google_place_id ?? ""}
          />
          <input
            type="hidden"
            name="formatted_address"
            value={place?.formattedAddress ?? studio?.formatted_address ?? ""}
          />
          <input
            type="hidden"
            name="latitude"
            value={place?.lat?.toString() ?? studio?.latitude?.toString() ?? ""}
          />
          <input
            type="hidden"
            name="longitude"
            value={
              place?.lng?.toString() ?? studio?.longitude?.toString() ?? ""
            }
          />
          <input
            type="hidden"
            name="google_maps_url"
            value={place?.mapsUrl ?? studio?.google_maps_url ?? ""}
          />
        </div>
      )}

      {/* When no Google key: preserve existing place data on edit */}
      {!GOOGLE_API_KEY && studio && (
        <>
          <input
            type="hidden"
            name="google_place_id"
            value={studio.google_place_id ?? ""}
          />
          <input
            type="hidden"
            name="formatted_address"
            value={studio.formatted_address ?? ""}
          />
          <input
            type="hidden"
            name="latitude"
            value={studio.latitude?.toString() ?? ""}
          />
          <input
            type="hidden"
            name="longitude"
            value={studio.longitude?.toString() ?? ""}
          />
          <input
            type="hidden"
            name="google_maps_url"
            value={studio.google_maps_url ?? ""}
          />
        </>
      )}

      {/* Section 3: Public visibility */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Public visibility
        </p>
        <select
          name="visibility_mode"
          value={visibilityMode}
          onChange={(e) => setVisibilityMode(e.target.value)}
          className={INPUT_CLS}
        >
          {(
            Object.entries(VISIBILITY_LABELS) as [
              keyof typeof VISIBILITY_LABELS,
              string,
            ][]
          ).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {visibilityMode === "after_approval_only" && (
          <p className="text-xs text-muted-foreground">
            City/area shown publicly. Exact address sent with approval email.
          </p>
        )}
        {visibilityMode === "hidden" && (
          <p className="text-xs text-muted-foreground">
            Not shown on your public booking form.
          </p>
        )}
      </div>

      {/* Section 4: Public note */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Public note{" "}
          <span className="font-normal normal-case">(optional)</span>
        </p>
        <textarea
          name="public_note"
          rows={2}
          defaultValue={studio?.public_note ?? ""}
          placeholder="e.g. By appointment only · Ring the doorbell"
          className={`${INPUT_CLS} resize-none`}
          maxLength={500}
        />
      </div>

      {/* Section 5: Primary studio */}
      <div className="flex items-center justify-between rounded-md border-2 border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Primary studio on booking form
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Shown as your default location to clients.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPrimary}
          onClick={() => setIsPrimary((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            isPrimary ? "bg-foreground" : "bg-border"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
              isPrimary ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <input
          type="hidden"
          name="is_primary"
          value={isPrimary ? "true" : "false"}
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
          {pending ? <Spinner className="mx-auto h-4 w-4" /> : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border-2 border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditStudioModal({
  studio,
  onClose,
}: {
  studio: Studio;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    updateStudioAction,
    null,
  );
  const prevState = useRef(state);
  useEffect(() => {
    if (prevState.current !== state && state && "success" in state) {
      startTransition(onClose);
    }
    prevState.current = state;
  }, [state, onClose]);

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Edit studio</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>
      <StudioForm
        studio={studio}
        action={action}
        pending={pending}
        state={state}
        onCancel={onClose}
        submitLabel="Save changes"
      />
    </div>
  );
}

function AddStudioForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, action, pending] = useActionState<State, FormData>(
    createStudioAction,
    null,
  );
  const prevState = useRef(state);
  useEffect(() => {
    if (prevState.current !== state && state && "success" in state) {
      startTransition(onSuccess);
    }
    prevState.current = state;
  }, [state, onSuccess]);

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <p className="text-sm font-medium text-foreground">Add studio</p>
      <StudioForm
        action={action}
        pending={pending}
        state={state}
        onCancel={onSuccess}
        submitLabel="Save studio"
      />
    </div>
  );
}

function visibilityBadge(mode: string) {
  const labels: Record<string, string> = {
    public_exact_address: "Public",
    public_area_only: "Area only",
    after_approval_only: "After approval",
    hidden: "Hidden",
  };
  return labels[mode] ?? mode;
}

export default function StudioList({ studios }: { studios: Studio[] }) {
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingStudio, setEditingStudio] = useState<Studio | null>(null);

  function handleDelete(id: string) {
    if (!confirm("Remove this studio from your library?")) return;
    setDeleting(id);
    startTransition(async () => {
      await deleteStudioAction(id);
      setDeleting(null);
    });
  }

  return (
    <>
      <div className="rounded-md border-2 border-border px-5 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-foreground">
              Studio library
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage studios and control what clients see on your booking form.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showForm ? "Cancel" : "+ Add"}
          </button>
        </div>

        {studios.length > 0 && (
          <div className="divide-y divide-border rounded-md border-2 border-border">
            {studios.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-foreground">{s.name}</p>
                    {s.is_primary && (
                      <span className="text-xs font-medium text-brand-mustard">
                        Primary
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      · {visibilityBadge(s.visibility_mode)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {s.formatted_address
                      ? s.formatted_address
                      : [s.city, s.country].filter(Boolean).join(", ") ||
                        s.address ||
                        "No location"}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingStudio(s)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={deleting === s.id}
                    onClick={() => handleDelete(s.id)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                  >
                    {deleting === s.id ? "…" : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {studios.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">
            No studios saved yet. Add a studio to display your location on your
            public booking form.
          </p>
        )}

        {showForm && <AddStudioForm onSuccess={() => setShowForm(false)} />}
      </div>

      {editingStudio && (
        <Modal onClose={() => setEditingStudio(null)}>
          <EditStudioModal
            studio={editingStudio}
            onClose={() => setEditingStudio(null)}
          />
        </Modal>
      )}
    </>
  );
}
