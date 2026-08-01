"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ARTIST_CANCELLABLE_PAYMENT_REQUEST_STATUSES,
  UNFROZEN_PAYMENT_REQUEST_STATUSES,
} from "@inklee/shared/appointment-payments";
import type { PaymentRequestSummary } from "@/lib/server/appointment-payment-read";
import {
  sendPaymentRequestAction,
  cancelPaymentRequestAction,
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
// we surface, rather than doing anything. Cancel visibility DERIVES from the
// same constant the core enforces with (authz-review Finding A: a hand-typed
// complement here drifted from it both ways — hid Cancel on `expired`, showed
// it on `payment_processing`).
// Send visibility derives from UNFROZEN (draft/ready), which is exactly what
// the send RPC accepts (0126 returns 'not_sendable' outside it). The verifier
// confirmed the hand-typed set had NOT drifted, but nothing pinned the
// agreement while an identical shared constant sat unused. Now it is derived.
const SENDABLE = new Set<string>(UNFROZEN_PAYMENT_REQUEST_STATUSES);
const CANCELLABLE = new Set<string>(
  ARTIST_CANCELLABLE_PAYMENT_REQUEST_STATUSES,
);

export function PaymentRequestsList({
  requests,
}: {
  requests: PaymentRequestSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The pay link from the last send. The token is stored hashed server-side, so
  // this response is the only carrier: always show it so the artist can share
  // it themselves (DMs are how most of this audience talks to clients).
  const [sent, setSent] = useState<{ payUrl: string; emailed: boolean } | null>(
    null,
  );

  const cancel = (id: string) => {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await cancelPaymentRequestAction(id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const send = (id: string) => {
    setError(null);
    setSent(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await sendPaymentRequestAction(id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent({ payUrl: result.payUrl, emailed: result.emailed });
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
      {sent && (
        <div className="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
          <p className="text-foreground">
            {sent.emailed
              ? "Sent. Your client got the payment link by email. You can also share it yourself:"
              : "Sent, but the email could not be delivered. Share the payment link with your client yourself:"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded bg-muted/40 px-2 py-1 text-xs text-foreground">
              {sent.payUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(sent.payUrl);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
            >
              Copy link
            </button>
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {requests.map((r) => {
          const cancellable = CANCELLABLE.has(r.status);
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
                    onClick={() => send(r.id)}
                    className="rounded-lg bg-brand-mustard px-3 py-1.5 text-xs font-semibold text-brand-charcoal transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {rowBusy ? "Working..." : "Send"}
                  </button>
                )}
                {cancellable && (
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => cancel(r.id)}
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
