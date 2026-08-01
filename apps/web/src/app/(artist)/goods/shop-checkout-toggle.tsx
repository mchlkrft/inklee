"use client";

import { startTransition, useState } from "react";
import { saveShopCheckoutEnabledAction } from "./actions";

// Instant switch for the standalone shop checkout (decision S2), same pattern
// as ShopVisibilityToggle under booking settings: optimistic local flip, a
// server action that revalidates on completion, revert + show the error on
// failure.
export default function ShopCheckoutToggle({ enabled }: { enabled: boolean }) {
  const [checked, setChecked] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    const next = !checked;
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const result = await saveShopCheckoutEnabledAction(next);
      if (result && "error" in result) {
        setChecked(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-2 rounded-[20px] border border-border px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            Standalone shop checkout
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Let clients buy your products without booking an appointment.
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
