"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import GooglePlacesPicker, {
  type PlaceResult,
} from "@/components/google-places-picker";
import SelectInput from "@/components/select-input";
import {
  MAP_LOCATION_CATEGORY_LABELS,
  MAP_LOCATION_SOURCES,
  MAP_MODERATION_LABELS,
  type MapLocationCategory,
  type MapModerationStatus,
} from "@inklee/shared/map-directory";
import {
  createMapLocationAction,
  deleteMapLocationAction,
  updateMapLocationAction,
  type MapLocationFormInput,
} from "./actions";
import { convertCandidateAction } from "./seeding/actions";
import type { DuplicateHit } from "@inklee/shared/map-directory";

export type LocationFormValues = MapLocationFormInput & { id?: string };

const CATEGORY_OPTIONS = (
  Object.entries(MAP_LOCATION_CATEGORY_LABELS) as Array<
    [MapLocationCategory, string]
  >
).map(([value, label]) => ({ value, label }));

const MODERATION_OPTIONS = (
  Object.entries(MAP_MODERATION_LABELS) as Array<[MapModerationStatus, string]>
).map(([value, label]) => ({ value, label }));

const SOURCE_OPTIONS = MAP_LOCATION_SOURCES.map((value) => ({
  value,
  label: value.replace(/_/g, " "),
}));

const EMPTY: LocationFormValues = {
  name: "",
  category: "tattoo_studio",
  latitude: Number.NaN,
  longitude: Number.NaN,
  address: null,
  city: null,
  country: null,
  postalCode: null,
  googlePlaceId: null,
  websiteUrl: null,
  instagramHandle: null,
  source: "inklee_seed",
  moderationStatus: "pending",
  isSeed: true,
};

export default function LocationForm({
  initial,
  placesApiKey,
  convertCandidateId,
}: {
  initial?: LocationFormValues;
  placesApiKey: string | null;
  // Seeding-tool conversion: same form, same pipeline, plus marking the
  // candidate converted on success.
  convertCandidateId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<LocationFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateHit[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);

  const set = <K extends keyof LocationFormValues>(
    key: K,
    value: LocationFormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));

  const applyPlace = (place: PlaceResult) => {
    setValues((v) => ({
      ...v,
      name: v.name || place.name,
      latitude: place.lat ?? v.latitude,
      longitude: place.lng ?? v.longitude,
      address: place.formattedAddress || v.address,
      city: place.city ?? v.city,
      country: place.country ?? v.country,
      googlePlaceId: place.placeId,
    }));
  };

  const submit = (ignoreDuplicates = false) => {
    setError(null);
    setDuplicates(null);
    startTransition(async () => {
      const input: MapLocationFormInput = { ...values };
      const result = convertCandidateId
        ? await convertCandidateAction(
            convertCandidateId,
            input,
            ignoreDuplicates,
          )
        : initial?.id
          ? await updateMapLocationAction(initial.id, input, ignoreDuplicates)
          : await createMapLocationAction(input, ignoreDuplicates);
      if (result.duplicates) {
        setDuplicates(result.duplicates);
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(convertCandidateId ? "/admin/map/seeding" : "/admin/map");
      router.refresh();
    });
  };

  const remove = () => {
    if (!initial?.id) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteMapLocationAction(initial.id!);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/admin/map");
      router.refresh();
    });
  };

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const label = "text-xs text-muted-foreground";

  return (
    <div className="space-y-5">
      {placesApiKey ? (
        <div className="space-y-1">
          <p className={label}>
            Find via Google Places (fills the fields below)
          </p>
          <GooglePlacesPicker
            apiKey={placesApiKey}
            onPlaceSelect={applyPlace}
            onClear={() => set("googlePlaceId", null)}
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label className={label} htmlFor="loc-name">
            Name
          </label>
          <input
            id="loc-name"
            className={field}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Studio or shop name"
          />
        </div>
        <div className="space-y-1">
          <span className={label}>Category</span>
          <SelectInput
            options={CATEGORY_OPTIONS}
            value={values.category}
            onChange={(e) => set("category", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <span className={label}>Source</span>
          <SelectInput
            options={SOURCE_OPTIONS}
            value={values.source}
            onChange={(e) => set("source", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="loc-lat">
            Latitude
          </label>
          <input
            id="loc-lat"
            className={field}
            type="number"
            step="any"
            value={Number.isFinite(values.latitude) ? values.latitude : ""}
            onChange={(e) => set("latitude", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="loc-lng">
            Longitude
          </label>
          <input
            id="loc-lng"
            className={field}
            type="number"
            step="any"
            value={Number.isFinite(values.longitude) ? values.longitude : ""}
            onChange={(e) => set("longitude", Number(e.target.value))}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className={label} htmlFor="loc-address">
            Address
          </label>
          <input
            id="loc-address"
            className={field}
            value={values.address ?? ""}
            onChange={(e) => set("address", e.target.value || null)}
          />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="loc-city">
            City
          </label>
          <input
            id="loc-city"
            className={field}
            value={values.city ?? ""}
            onChange={(e) => set("city", e.target.value || null)}
          />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="loc-country">
            Country
          </label>
          <input
            id="loc-country"
            className={field}
            value={values.country ?? ""}
            onChange={(e) => set("country", e.target.value || null)}
          />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="loc-website">
            Website
          </label>
          <input
            id="loc-website"
            className={field}
            value={values.websiteUrl ?? ""}
            onChange={(e) => set("websiteUrl", e.target.value || null)}
            placeholder="https://"
          />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor="loc-instagram">
            Instagram handle
          </label>
          <input
            id="loc-instagram"
            className={field}
            value={values.instagramHandle ?? ""}
            onChange={(e) => set("instagramHandle", e.target.value || null)}
            placeholder="handle without @"
          />
        </div>
        <div className="space-y-1">
          <span className={label}>Moderation status</span>
          <SelectInput
            options={MODERATION_OPTIONS}
            value={values.moderationStatus}
            onChange={(e) => set("moderationStatus", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <span className={label}>Seeded entry</span>
          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={values.isSeed}
              onChange={(e) => set("isSeed", e.target.checked)}
            />
            Counts toward the 5 per 300 square km cap
          </label>
        </div>
      </div>

      {error ? <p className="text-sm text-brand-red">{error}</p> : null}

      {duplicates ? (
        <div className="space-y-2 rounded-md border border-brand-mustard/60 bg-brand-mustard/10 p-3">
          <p className="text-sm font-medium text-foreground">
            This might already be on the map:
          </p>
          <ul className="space-y-1">
            {duplicates.map((d) => (
              <li key={d.locationId} className="text-sm text-foreground">
                <a
                  href={`/admin/map/${d.locationId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {d.name}
                </a>{" "}
                <span className="text-xs text-muted-foreground">
                  {[d.city, d.country].filter(Boolean).join(", ")} ·{" "}
                  {d.confidence} duplicate
                  {d.signals.distanceM < 100000
                    ? ` · ${d.signals.distanceM} m away`
                    : ""}
                  {d.signals.nameSimilarity >= 0.4
                    ? ` · name ${Math.round(d.signals.nameSimilarity * 100)}% similar`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(true)}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
          >
            Not a duplicate, save anyway
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submit()}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving..." : isEdit ? "Save changes" : "Create location"}
        </button>
        {isEdit ? (
          confirmDelete ? (
            <>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="rounded-md border border-brand-red px-4 py-2 text-sm text-brand-red transition-colors hover:bg-brand-red/10 disabled:opacity-50"
              >
                Yes, delete permanently
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground"
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-brand-red disabled:opacity-50"
            >
              Delete
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
