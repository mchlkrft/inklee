"use client";

import { useState, useTransition } from "react";
import { markGoodsPickedUp } from "../../actions";

export default function GoodsPickupButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await markGoodsPickedUp(orderId);
            if (result && "error" in result) setError(result.error);
          })
        }
        className="w-full rounded-full bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark goods as picked up"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
