"use client";

import { useState, useTransition } from "react";
import GooglePlacesPicker, {
  type PlaceResult,
} from "@/components/google-places-picker";
import SelectInput from "@/components/select-input";
import {
  MAP_VISIBILITY_LABELS,
  type MapVisibilityMode,
} from "@inklee/shared/map-directory";
import { updateMapPresenceAction, type MapPresenceInput } from "./actions";

export type MapPresenceValues = {
  mapVisibility: string;
  lookingForGuestSpots: boolean;
  cityLabel: string | null;
  cityPlaceId: string | null;
  cityLat: number | null;
  cityLng: number | null;
  travelMapConsent: boolean;
  styleKeys: string[];
};

const VISIBILITY_OPTIONS = (
  Object.entries(MAP_VISIBILITY_LABELS) as Array<[MapVisibilityMode, string]>
).map(([value, label]) => ({ value, label }));

const VISIBILITY_HELP: Record<MapVisibilityMode, string> = {
  off: "You do not appear on the map in any form.",
  city_only:
    "You count toward the anonymous artist number in your city, without your name.",
  listed:
    "Other artists can see you in the artists-in-town list for your city.",
};

export default function MapPresenceForm({
  initial,
  styles,
  placesApiKey,
}: {
  initial: MapPresenceValues;
  styles: Array<{ key: string; label: string }>;
  placesApiKey: string | null;
}) {
  const [values, setValues] = useState<MapPresenceValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof MapPresenceValues>(
    key: K,
    value: MapPresenceValues[K],
  ) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: value }));
  };

  const applyCity = (place: PlaceResult) => {
    setSaved(false);
    // Only accept results that resolve to a CITY with coordinates: a street
    // address or business would store an exact position under a venue name,
    // breaking the city-only promise.
    if (
      !place.city ||
      !Number.isFinite(place.lat ?? Number.NaN) ||
      !Number.isFinite(place.lng ?? Number.NaN)
    ) {
      setCityError("Pick a city from the list, not an address.");
      return;
    }
    setCityError(null);
    setValues((v) => ({
      ...v,
      cityLabel: [place.city, place.country].filter(Boolean).join(", "),
      cityPlaceId: place.placeId,
      cityLat: place.lat,
      cityLng: place.lng,
    }));
  };

  const clearCity = () => {
    setSaved(false);
    setCityError(null);
    setValues((v) => ({
      ...v,
      cityLabel: null,
      cityPlaceId: null,
      cityLat: null,
      cityLng: null,
    }));
  };

  const MAX_STYLES = 8;

  const toggleStyle = (key: string) => {
    setSaved(false);
    setValues((v) => {
      if (v.styleKeys.includes(key))
        return { ...v, styleKeys: v.styleKeys.filter((k) => k !== key) };
      if (v.styleKeys.length >= MAX_STYLES) return v;
      return { ...v, styleKeys: [...v.styleKeys, key] };
    });
  };

  const submit = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const input: MapPresenceInput = { ...values };
      const result = await updateMapPresenceAction(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  };

  const visibilityMode = values.mapVisibility as MapVisibilityMode;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Visibility
        </p>
        <SelectInput
          options={VISIBILITY_OPTIONS}
          value={values.mapVisibility}
          onChange={(e) => set("mapVisibility", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {VISIBILITY_HELP[visibilityMode] ?? ""}
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Your city
        </p>
        {values.cityLabel ? (
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <p className="text-sm text-foreground">{values.cityLabel}</p>
            <button
              type="button"
              onClick={clearCity}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        ) : placesApiKey ? (
          <GooglePlacesPicker
            apiKey={placesApiKey}
            onPlaceSelect={applyCity}
            onClear={clearCity}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            City search is unavailable right now.
          </p>
        )}
        {cityError ? (
          <p className="text-xs text-brand-red">{cityError}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Only the city is ever shown, never an address or live position.
        </p>
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.lookingForGuestSpots}
            onChange={(e) => set("lookingForGuestSpots", e.target.checked)}
          />
          Looking for guest spots
        </label>
        <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.travelMapConsent}
            onChange={(e) => set("travelMapConsent", e.target.checked)}
          />
          Show my upcoming trip cities on the map
        </label>
        <p className="text-xs text-muted-foreground">
          Trip cities come from your Guest Spots planner and appear at city
          level only. This is separate from showing trips on your booking form.
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Your styles
        </p>
        <div className="flex flex-wrap gap-1.5">
          {styles.map((s) => {
            const active = values.styleKeys.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleStyle(s.key)}
                className={`rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Styles help other artists find you and will power map filters.{" "}
          {values.styleKeys.length} of {MAX_STYLES} picked.
        </p>
      </section>

      {error ? <p className="text-sm text-brand-red">{error}</p> : null}
      {saved ? <p className="text-sm text-muted-foreground">Saved.</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save map presence"}
      </button>
    </div>
  );
}
