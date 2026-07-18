"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptProposalAction,
  cancelStayAction,
  withdrawRequestAction,
} from "../actions";

export default function RequestActions({
  requestId,
  stayId,
  canWithdraw,
  canAcceptProposal,
}: {
  requestId: string;
  stayId: string | null;
  canWithdraw: boolean;
  canAcceptProposal: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"withdraw" | "cancel" | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirming(null);
      router.refresh();
    });
  };

  if (!canWithdraw && !canAcceptProposal && !stayId) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {canAcceptProposal ? (
          <button
            type="button"
            onClick={() => run(() => acceptProposalAction(requestId))}
            disabled={pending}
            className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Take the suggested dates
          </button>
        ) : null}
        {canWithdraw ? (
          confirming === "withdraw" ? (
            <span className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => run(() => withdrawRequestAction(requestId))}
                disabled={pending}
                className="rounded-md bg-brand-red px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Yes, withdraw
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={pending}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming("withdraw")}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              Withdraw request
            </button>
          )
        ) : null}
        {stayId ? (
          confirming === "cancel" ? (
            <span className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => run(() => cancelStayAction(stayId))}
                disabled={pending}
                className="rounded-md bg-brand-red px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Yes, cancel the guest spot
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={pending}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming("cancel")}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              Cancel guest spot
            </button>
          )
        ) : null}
      </div>
      {stayId && confirming !== "cancel" ? (
        <p className="text-xs text-muted-foreground">
          Cancelling removes the trip from your travel calendar.
        </p>
      ) : null}
      {error ? <p className="text-xs text-brand-red">{error}</p> : null}
    </div>
  );
}
