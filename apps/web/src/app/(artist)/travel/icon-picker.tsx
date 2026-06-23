"use client";

import { useState } from "react";
import { Ban, MapPin } from "lucide-react";
import {
  TRAVEL_ICON_KEYS,
  TRAVEL_ICON_COLORS,
  DEFAULT_ICON_COLOR,
  randomTravelIconKey,
  sanitizeTravelIcon,
  sanitizeTravelIconColor,
  type TravelIconKey,
} from "@inklee/shared/travel-icons";
import { TravelIcon } from "@/components/travel-icon";

// Icon grid + color row for trips + studios (artist-side only): a wrap-row of the
// founder's custom inklee tattoo-badge icons led by a "no icon" chip, plus a
// swatch row for the icon color. Both values ride hidden inputs so the
// surrounding form action reads them like any other field.
export function IconPickerGrid({
  name = "icon",
  colorName = "icon_color",
  initial,
  initialColor,
  randomizeWhenEmpty = false,
}: {
  name?: string;
  colorName?: string;
  initial?: string | null;
  initialColor?: string | null;
  /** New trips/studios pre-fill a random inklee icon instead of "no icon", so
   *  the default is a real mark not the generic fallback. Computed once. */
  randomizeWhenEmpty?: boolean;
}) {
  const [value, setValue] = useState<TravelIconKey | null>(
    () =>
      sanitizeTravelIcon(initial ?? null) ??
      (randomizeWhenEmpty ? randomTravelIconKey() : null),
  );
  const [color, setColor] = useState<string | null>(
    sanitizeTravelIconColor(initialColor ?? null),
  );
  const resolved = color ?? DEFAULT_ICON_COLOR;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-label="No icon"
          aria-pressed={value === null}
          onClick={() => setValue(null)}
          className={`flex h-12 w-12 items-center justify-center rounded-lg border transition-colors ${
            value === null
              ? "border-foreground bg-muted/30 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Ban className="h-4 w-4" />
        </button>
        {TRAVEL_ICON_KEYS.map((key) => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              aria-label={`Icon: ${key}`}
              aria-pressed={selected}
              onClick={() => setValue(key)}
              className={`flex h-12 w-12 items-center justify-center rounded-lg border transition-colors ${
                selected
                  ? "border-foreground bg-brand-bone"
                  : "border-border hover:opacity-80"
              }`}
            >
              <TravelIcon
                icon={key}
                fallback={MapPin}
                className="h-8 w-8"
                color={selected ? resolved : undefined}
              />
            </button>
          );
        })}
      </div>

      {/* Color row. The first chip clears the choice (default color). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Color</span>
        <button
          type="button"
          aria-label="Default color"
          aria-pressed={color === null}
          onClick={() => setColor(null)}
          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
            color === null ? "border-foreground" : "border-border"
          }`}
          style={{ backgroundColor: DEFAULT_ICON_COLOR }}
        >
          <Ban className="h-3.5 w-3.5 text-background" />
        </button>
        {TRAVEL_ICON_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            className={`h-7 w-7 rounded-full border transition-colors ${
              color === c ? "border-foreground" : "border-border"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <input type="hidden" name={name} value={value ?? ""} />
      <input type="hidden" name={colorName} value={color ?? ""} />
    </div>
  );
}

export { TravelIcon };
