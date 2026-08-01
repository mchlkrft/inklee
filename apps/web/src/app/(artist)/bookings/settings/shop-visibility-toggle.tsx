"use client";

import { startTransition, useState } from "react";
import { saveShopVisibilityAction } from "./actions";

// Instant switch, same pattern as the trip "Show on booking form" toggle
// (travel/trip-manager.tsx): no form submit, just an optimistic local flip
// backed by a server action that revalidates on completion.
export default function ShopVisibilityToggle({ show }: { show: boolean }) {
  const [checked, setChecked] = useState(show);
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    const next = !checked;
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const result = await saveShopVisibilityAction(next);
      if (result && "error" in result) {
        setChecked(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-md border-2 border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Show the shop on your booking page
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Clients see a preview of your products before they book.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            checked ? "bg-foreground" : "bg-border"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow transition-transform ${
              checked ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
