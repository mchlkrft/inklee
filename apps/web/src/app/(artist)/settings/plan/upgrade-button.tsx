"use client";

import { useState, useTransition } from "react";
import { trackEvent } from "@/lib/track";
import { startPlusCheckoutAction } from "./actions";

export default function UpgradeButton({ label }: { label: string }) {
  const [pending, startTransitionFn] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          trackEvent("plus_upgrade_click");
          setMessage(null);
          startTransitionFn(async () => {
            const result = await startPlusCheckoutAction();
            if ("url" in result) {
              window.location.href = result.url;
              return;
            }
            setMessage(result.message);
          });
        }}
        className="inline-flex items-center justify-center rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-brand-bone transition-colors hover:bg-brand-red/90 disabled:opacity-60"
      >
        {pending ? "Starting checkout..." : label}
      </button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
