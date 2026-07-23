"use client";

import { useState, useTransition } from "react";
import { openBillingPortalAction } from "./actions";

export default function ManageSubscriptionButton() {
  const [pending, startTransitionFn] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransitionFn(async () => {
            const result = await openBillingPortalAction();
            if ("url" in result) {
              window.location.href = result.url;
              return;
            }
            setMessage(result.message);
          });
        }}
        className="inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50 disabled:opacity-60"
      >
        {pending ? "Opening..." : "Manage subscription"}
      </button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
