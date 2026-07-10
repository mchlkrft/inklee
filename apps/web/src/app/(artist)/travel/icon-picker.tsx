"use client";

import { useState } from "react";
import { Ban, MapPin } from "lucide-react";
import {
  TRAVEL_ICON_KEYS,
  TRAVEL_ICON_COLORS,
  TRAVEL_ICON_BG_COLORS,
  DEFAULT_ICON_BG,
  DEFAULT_TRIP_ICON_COLOR,
  DEFAULT_STUDIO_ICON_COLOR,
  randomTravelIconKey,
  sanitizeTravelIcon,
  sanitizeTravelIconColor,
  sanitizeTravelIconBg,
  type TravelIconKey,
} from "@inklee/shared/travel-icons";
import { TravelIcon } from "@/components/travel-icon";

// Icon grid + color/background rows for trips + studios (artist-side only): a
// wrap-row of the founder's custom inklee tattoo-badge icons led by a "no icon"
// chip, plus swatch rows for the icon color and the tile background. All three
// values ride hidden inputs so the surrounding form action reads them like any
// other field. The selected icon chip doubles as the live preview (chosen mark
// in the chosen color on the chosen background).
export function IconPickerGrid({
  kind,
  name = "icon",
  colorName = "icon_color",
  bgName = "icon_bg",
  initial,
  initialColor,
  initialBg,
  randomizeWhenEmpty = false,
}: {
  /** Which editor hosts the picker. Sets the default icon color the "default"
   *  chip previews: trips mark charcoal on bone, studios mark red on bone. */
  kind: "trip" | "studio";
  name?: string;
  colorName?: string;
  bgName?: string;
  initial?: string | null;
  initialColor?: string | null;
  initialBg?: string | null;
  /** New trips/studios pre-fill a random inklee icon instead of "no icon", so
   *  the default is a real mark not the generic fallback. Computed once. */
  randomizeWhenEmpty?: boolean;
}) {
  const defaultColor =
    kind === "studio" ? DEFAULT_STUDIO_ICON_COLOR : DEFAULT_TRIP_ICON_COLOR;
  const [value, setValue] = useState<TravelIconKey | null>(
    () =>
      sanitizeTravelIcon(initial ?? null) ??
      (randomizeWhenEmpty ? randomTravelIconKey() : null),
  );
  const [color, setColor] = useState<string | null>(
    sanitizeTravelIconColor(initialColor ?? null),
  );
  const [bg, setBg] = useState<string | null>(
    sanitizeTravelIconBg(initialBg ?? null),
  );
  const resolved = color ?? defaultColor;
  const resolvedBg = bg ?? DEFAULT_ICON_BG;

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
                  ? "border-foreground"
                  : "border-border hover:opacity-80"
              }`}
              style={selected ? { backgroundColor: resolvedBg } : undefined}
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
        <span className="w-20 text-xs text-muted-foreground">Color</span>
        <button
          type="button"
          aria-label="Default color"
          aria-pressed={color === null}
          onClick={() => setColor(null)}
          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
            color === null ? "border-foreground" : "border-border"
          }`}
          style={{ backgroundColor: defaultColor }}
        >
          <Ban className="h-3.5 w-3.5" style={{ color: DEFAULT_ICON_BG }} />
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

      {/* Background row for the icon tile. First chip = default (bone). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-xs text-muted-foreground">Background</span>
        <button
          type="button"
          aria-label="Default background"
          aria-pressed={bg === null}
          onClick={() => setBg(null)}
          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
            bg === null ? "border-foreground" : "border-border"
          }`}
          style={{ backgroundColor: DEFAULT_ICON_BG }}
        >
          <Ban
            className="h-3.5 w-3.5"
            style={{ color: DEFAULT_TRIP_ICON_COLOR }}
          />
        </button>
        {TRAVEL_ICON_BG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Background ${c}`}
            aria-pressed={bg === c}
            onClick={() => setBg(c)}
            className={`h-7 w-7 rounded-full border transition-colors ${
              bg === c ? "border-foreground" : "border-border"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <input type="hidden" name={name} value={value ?? ""} />
      <input type="hidden" name={colorName} value={color ?? ""} />
      <input type="hidden" name={bgName} value={bg ?? ""} />
    </div>
  );
}

export { TravelIcon };
