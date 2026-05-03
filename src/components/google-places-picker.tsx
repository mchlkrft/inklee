"use client";

import { useEffect, useRef, useState } from "react";

export type PlaceResult = {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
  city: string | null;
  country: string | null;
};

type Props = {
  onPlaceSelect: (place: PlaceResult) => void;
  onClear: () => void;
  apiKey: string;
};

declare global {
  interface Window {
    __inklee_gmap_cb?: () => void;
  }
}

export default function GooglePlacesPicker({
  onPlaceSelect,
  onClear,
  apiKey,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Check synchronously on first render — if the script was already loaded by
  // a previous mount of this component, we don't need to wait for an event.
  const [loaded, setLoaded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !!(window as any).google?.maps?.places;
  });
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!apiKey || loaded) return;

    const scriptId = "__inklee_google_maps__";
    if (document.getElementById(scriptId)) {
      const existing = document.getElementById(scriptId)!;
      const onLoad = () => setLoaded(true);
      existing.addEventListener("load", onLoad);
      return () => existing.removeEventListener("load", onLoad);
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, [apiKey, loaded]);

  useEffect(() => {
    if (!loaded || !inputRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gMaps = (window as any).google.maps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ac: any = new gMaps.places.Autocomplete(inputRef.current, {
      fields: [
        "place_id",
        "name",
        "formatted_address",
        "geometry",
        "url",
        "address_components",
      ],
    });

    const listener = gMaps.event.addListener(ac, "place_changed", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const place: any = ac.getPlace();
      if (!place?.place_id) return;

      const lat: number | null = place.geometry?.location?.lat?.() ?? null;
      const lng: number | null = place.geometry?.location?.lng?.() ?? null;

      let city: string | null = null;
      let country: string | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const comp of (place.address_components ?? []) as any[]) {
        if (comp.types?.includes("locality")) city = comp.long_name;
        if (comp.types?.includes("country")) country = comp.long_name;
      }

      const result: PlaceResult = {
        placeId: place.place_id,
        name: place.name ?? "",
        formattedAddress: place.formatted_address ?? "",
        lat,
        lng,
        mapsUrl: place.url ?? null,
        city,
        country,
      };

      setSelectedName(place.name ?? place.formatted_address ?? "");
      onPlaceSelect(result);
    });

    cleanupRef.current = () => gMaps.event.removeListener(listener);
    return () => cleanupRef.current?.();
  }, [loaded, onPlaceSelect]);

  if (selectedName) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border-2 border-border px-3 py-2">
        <p className="text-sm text-foreground truncate">{selectedName}</p>
        <button
          type="button"
          onClick={() => {
            setSelectedName(null);
            onClear();
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={
        loaded ? "Search for a studio or location…" : "Loading Maps…"
      }
      disabled={!loaded}
      className="w-full rounded-md border-2 border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      autoComplete="off"
    />
  );
}
