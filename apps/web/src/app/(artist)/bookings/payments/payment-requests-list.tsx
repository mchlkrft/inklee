"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PaymentRequestSummary } from "@/lib/server/appointment-payment-read";
import {
  sendPaymentRequestAction,
  cancelPaymentRequestAction,
  type PaymentActionResult,
} from "./actions";

function formatAmount(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function statusLabel(status: string): string {
  const t = status.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// UI hints only: which actions to OFFER. The cores re-validate the 13-state
// machine, so a button the state does not actually allow just returns an error
// we surface, rather than doing anything. Send is offered before the request is
// frozen; cancel until it reaches a terminal or paid state.
const SENDABLE = new Set(["draft", "ready"]);
const TERMINAL = new Set([
  "paid",
  "cancelled",
  "expired",
  "refunded",
  "partially_refunded",
  "disputed",
]);

export function PaymentRequestsList({
  requests,
}: {
  requests: PaymentRequestSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = (
    action: (id: string) => Promise<PaymentActionResult>,
    id: string,
  ) => {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await action(id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (requests.length === 0) {
    return (
      <p className="rounded-[14px] border border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No payment requests yet. Create one from a booking or project to give a
        client a secure payment link.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {requests.map((r) => {
          const cancellable = !TERMINAL.has(r.status);
          const sendable = SENDABLE.has(r.status);
          const rowBusy = pending && busyId === r.id;
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3"
            >
              <Link
                href={`/bookings/payments/${r.id}`}
                className="min-w-0 rounded-md transition-opacity hover:opacity-80"
              >
                <p className="truncate text-sm font-medium text-foreground">
                  {formatAmount(r.totalMinor, r.currency)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {r.subject === "appointment" ? "Appointment" : "Project"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {statusLabel(r.status)}
                  {r.revision > 1 ? ` (rev ${r.revision})` : ""}
                  {r.linkSent ? " · link sent" : ""}
                </p>
              </Link>
              <div className="flex items-center gap-2">
                {sendable && (
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => run(sendPaymentRequestAction, r.id)}
                    className="rounded-lg bg-brand-mustard px-3 py-1.5 text-xs font-semibold text-brand-charcoal transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {rowBusy ? "Working..." : "Send"}
                  </button>
                )}
                {cancellable && (
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => run(cancelPaymentRequestAction, r.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
