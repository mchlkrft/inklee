"use client";

import { useState } from "react";
import { Ban, MapPin } from "lucide-react";
import {
  TRAVEL_ICON_KEYS,
  sanitizeTravelIcon,
  type TravelIconKey,
} from "@inklee/shared/travel-icons";
import { TravelIcon } from "@/components/travel-icon";

// Icon grid for trips + studios (artist-side only): a wrap-row of the founder's
// custom inklee tattoo-badge icons, led by a "no icon" chip. Carries its value
// in a hidden input so the surrounding form action reads it like any other
// field. Detailed line art, so the chips run a touch larger than a glyph chip.
export function IconPickerGrid({
  name = "icon",
  initial,
}: {
  name?: string;
  initial?: string | null;
}) {
  const [value, setValue] = useState<TravelIconKey | null>(
    sanitizeTravelIcon(initial ?? null),
  );

  return (
    <div>
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
                  ? "border-foreground bg-muted/30 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <TravelIcon icon={key} fallback={MapPin} className="h-8 w-8" />
            </button>
          );
        })}
      </div>
      <input type="hidden" name={name} value={value ?? ""} />
    </div>
  );
}

export { TravelIcon };
