"use client";

import { useState, useTransition } from "react";
import { cancelSubscriptionAction } from "./actions";

// Ordinary subscription cancellation (§ 312k BGB "Kündigung"), placed in Settings
// next to account deletion and reachable after login. It is DISTINCT from the
// Art. 11a withdrawal: cancelling keeps Plus until the end of the paid period and
// issues no refund. Two-step to match § 312k: a plainly labelled cancellation
// button, then a confirmation step ("Cancel now") that shows when access ends.
// English (equally unambiguous) wording; a German-locale build should use
// "Verträge hier kündigen" / "jetzt kündigen".
export default function CancelSubscriptionSection({
  effectiveDateLabel,
  alreadyScheduled = false,
}: {
  effectiveDateLabel?: string | null;
  alreadyScheduled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransitionFn] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  if (alreadyScheduled) {
    return (
      <p className="text-sm text-muted-foreground">
        {effectiveDateLabel
          ? `Your subscription is set to end on ${effectiveDateLabel}. You keep Plus until then.`
          : "Your subscription is set to end at the close of the current paid period. You keep Plus until then."}
      </p>
    );
  }

  if (done) {
    return <p className="text-sm text-muted-foreground">{done}</p>;
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Cancelling ends your Inklee Plus subscription at the end of the
          current paid period. You keep Plus until then, and your account and
          all of your data are kept.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground"
        >
          Cancel your subscription here
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <p className="text-sm font-medium text-foreground">
        Cancel your subscription
      </p>
      <p className="text-sm text-muted-foreground">
        {effectiveDateLabel
          ? `Your Inklee Plus subscription will end on ${effectiveDateLabel}. You keep Plus until then, and there is no refund for the current period. Your account and all of your data are kept.`
          : "Your Inklee Plus subscription will end at the close of the current paid period. You keep Plus until then, and there is no refund for the current period. Your account and all of your data are kept."}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransitionFn(async () => {
              const r = await cancelSubscriptionAction({ confirmed: true });
              setDone(r.message);
            })
          }
          className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Cancelling…" : "Cancel now"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="text-sm text-muted-foreground underline disabled:opacity-60"
        >
          Keep my subscription
        </button>
      </div>
    </div>
  );
}
