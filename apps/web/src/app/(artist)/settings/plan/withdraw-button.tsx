"use client";

import { useState, useTransition } from "react";
import { withdrawFromSubscriptionAction } from "./actions";

// Statutory withdrawal function (Art. 11a), distinct from cancellation and
// continuously available on the plan page for a subscriber. It explains the
// difference from cancelling, takes an unequivocal withdrawal statement, and
// shows the acknowledgement. No dark patterns, no forced support, no reason asked.
export default function WithdrawButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransitionFn] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return <p className="text-sm text-muted-foreground">{done}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted-foreground underline"
      >
        Withdraw from contract here
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium text-foreground">
        Withdraw from your contract
      </p>
      <p className="text-sm text-muted-foreground">
        This is your 14-day right of withdrawal, which is different from
        cancelling. Withdrawing ends your Inklee Plus subscription now and
        refunds the part of the current period you have not used, or the full
        amount if you did not ask us to start immediately. Cancelling instead
        keeps your access until the end of the paid period. Either way you keep
        your account and all of your data. You do not need to give a reason or
        contact us.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransitionFn(async () => {
              const r = await withdrawFromSubscriptionAction({
                confirmed: true,
              });
              setDone(r.message);
            })
          }
          className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Processing..." : "Yes, withdraw from my contract"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="text-sm text-muted-foreground underline disabled:opacity-60"
        >
          Never mind
        </button>
      </div>
    </div>
  );
}
