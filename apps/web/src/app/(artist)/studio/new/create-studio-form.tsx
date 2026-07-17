"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import GooglePlacesPicker, {
  type PlaceResult,
} from "@/components/google-places-picker";
import SelectInput from "@/components/select-input";
import {
  ADDRESS_VISIBILITY_LABELS,
  GUEST_SPOT_STATUS_LABELS,
  type AddressVisibility,
  type GuestSpotStatus,
} from "@inklee/shared/studio-profile";
import type { DuplicateHit } from "@inklee/shared/map-directory";
import { createStudioAction } from "../actions";
import type { CreateStudioInput } from "@/lib/server/studios";

const VISIBILITY_OPTIONS = (
  Object.entries(ADDRESS_VISIBILITY_LABELS) as Array<
    [AddressVisibility, string]
  >
).map(([value, label]) => ({ value, label }));

const GUEST_OPTIONS = (
  Object.entries(GUEST_SPOT_STATUS_LABELS) as Array<[GuestSpotStatus, string]>
).map(([value, label]) => ({ value, label }));

type Place = {
  name: string;
  address: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string;
};

export default function CreateStudioForm({
  placesApiKey,
}: {
  placesApiKey: string | null;
}) {
  const router = useRouter();
  const [place, setPlace] = useState<Place | null>(null);
  const [name, setName] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [addressVisibility, setAddressVisibility] = useState<string>("exact");
  const [guestSpotStatus, setGuestSpotStatus] =
    useState<string>("not_accepting");
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateHit[] | null>(null);
  const [pending, startTransition] = useTransition();

  const applyPlace = (p: PlaceResult) => {
    setError(null);
    if (!Number.isFinite(p.lat ?? NaN) || !Number.isFinite(p.lng ?? NaN)) {
      setError("Pick your studio from the search so we get its location.");
      return;
    }
    setPlace({
      name: p.name,
      address: p.formattedAddress,
      city: p.city,
      country: p.country,
      lat: p.lat,
      lng: p.lng,
      placeId: p.placeId,
    });
    if (!name) setName(p.name);
  };

  const submit = (ignoreDuplicates = false) => {
    setError(null);
    setDuplicates(null);
    if (!place) {
      setError("Find your studio in the address search first.");
      return;
    }
    const input: CreateStudioInput = {
      name: name.trim() || place.name,
      description: null,
      vibe: null,
      address: place.address,
      city: place.city,
      country: place.country,
      postalCode: null,
      addressVisibility,
      guestSpotStatus,
      latitude: place.lat as number,
      longitude: place.lng as number,
      googlePlaceId: place.placeId,
      socialLink: socialLink.trim(),
    };
    startTransition(async () => {
      const result = await createStudioAction(input, ignoreDuplicates);
      if ("duplicates" in result) {
        setDuplicates(result.duplicates);
        return;
      }
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push("/studio/edit");
      router.refresh();
    });
  };

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const label = "text-xs text-muted-foreground";

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className={label}>Find your studio</p>
        {placesApiKey ? (
          <GooglePlacesPicker
            apiKey={placesApiKey}
            onPlaceSelect={applyPlace}
            onClear={() => setPlace(null)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Studio search is unavailable right now.
          </p>
        )}
        {place ? (
          <p className="text-xs text-foreground">{place.address}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="studio-name">
          Studio name
        </label>
        <input
          id="studio-name"
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Studio name"
        />
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="studio-social">
          Social link
        </label>
        <input
          id="studio-social"
          className={field}
          value={socialLink}
          onChange={(e) => setSocialLink(e.target.value)}
          placeholder="https://instagram.com/yourstudio"
        />
        <p className="text-xs text-muted-foreground">
          At least one link so artists can see it is really you.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <span className={label}>Address shows as</span>
          <SelectInput
            options={VISIBILITY_OPTIONS}
            value={addressVisibility}
            onChange={(e) => setAddressVisibility(e.target.value)}
            ariaLabel="Address shows as"
          />
        </div>
        <div className="space-y-1">
          <span className={label}>Guest spots</span>
          <SelectInput
            options={GUEST_OPTIONS}
            value={guestSpotStatus}
            onChange={(e) => setGuestSpotStatus(e.target.value)}
            ariaLabel="Guest spots"
          />
        </div>
      </div>

      {duplicates ? (
        <div className="space-y-2 rounded-md border border-brand-mustard/60 bg-brand-mustard/10 p-3">
          <p className="text-sm font-medium text-foreground">
            A studio like this may already be on the map:
          </p>
          <ul className="space-y-1 text-sm text-foreground">
            {duplicates.map((d) => (
              <li key={d.locationId}>
                {d.name}
                <span className="text-xs text-muted-foreground">
                  {[d.city, d.country].filter(Boolean).join(", ")
                    ? ` · ${[d.city, d.country].filter(Boolean).join(", ")}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            If one of those is your studio, claiming it keeps its history. If
            not, go ahead.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(true)}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
          >
            This is a new studio, create it
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-brand-red">{error}</p> : null}

      <button
        type="button"
        disabled={pending}
        onClick={() => submit()}
        className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Setting up..." : "Create studio"}
      </button>
    </div>
  );
}
