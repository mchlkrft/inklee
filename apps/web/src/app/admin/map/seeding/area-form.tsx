"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSeedAreaAction } from "./actions";

const FIELD =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const LABEL = "text-xs text-muted-foreground";

export default function AreaForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("15");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createSeedAreaAction({
        label,
        city: city || null,
        country: country || null,
        centerLat: Number(lat),
        centerLng: Number(lng),
        radiusKm: Number(radius),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setLabel("");
      setCity("");
      setCountry("");
      setLat("");
      setLng("");
      router.refresh();
    });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">New seed area</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label className={LABEL} htmlFor="area-label">
            Label
          </label>
          <input
            id="area-label"
            className={FIELD}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Chiang Mai old town"
          />
        </div>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="area-city">
            City
          </label>
          <input
            id="area-city"
            className={FIELD}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="area-country">
            Country
          </label>
          <input
            id="area-country"
            className={FIELD}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="area-lat">
            Center latitude
          </label>
          <input
            id="area-lat"
            className={FIELD}
            type="number"
            step="any"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="area-lng">
            Center longitude
          </label>
          <input
            id="area-lng"
            className={FIELD}
            type="number"
            step="any"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="area-radius">
            Radius (km)
          </label>
          <input
            id="area-radius"
            className={FIELD}
            type="number"
            step="any"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create area"}
        </button>
        {error ? <p className="text-xs text-brand-red">{error}</p> : null}
      </div>
    </section>
  );
}
