"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Inbox, Banknote } from "lucide-react";
import { Card, CardHeader, IconChip } from "@/components/ui/card";
import type { MobileActionItem } from "@inklee/shared/mobile-api";
import {
  acceptRequestAction,
  passRequestAction,
  markDepositReceivedAction,
} from "./actions";

type ActionResult = { error: string } | { success: true };

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount}`;
  }
}

const BTN_PRIMARY =
  "rounded-full bg-brand-mustard px-3.5 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50";
const BTN_GHOST =
  "rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50";
const BTN_DANGER =
  "rounded-full border border-destructive/50 px-3.5 py-1.5 text-xs font-medium text-destructive disabled:opacity-50";

// The ranked "Action required" feed. Each row carries its inline verb (Accept /
// Pass for a request, Mark received for a manual deposit) wired to a server
// action that calls the shared booking core; on success the action revalidates
// /dashboard, so the acted row drops out on the next render (no local list to
// keep in sync). Pass is two-step (decline sends an email), matching the detail.
export default function ActionFeed({ items }: { items: MobileActionItem[] }) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function act(key: string, fn: () => Promise<ActionResult>) {
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      const result = await fn();
      if ("error" in result) setError(result.error);
      setPendingKey(null);
      setConfirmKey(null);
    });
  }

  return (
    <Card className="space-y-4">
      <CardHeader>
        <IconChip icon={Inbox} tint="mustard" />
        <p className="text-sm font-medium text-foreground">Action required</p>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {items.length}
        </span>
      </CardHeader>

      <div className="divide-y divide-border">
        {items.map((item) => {
          const key = `${item.kind}-${item.bookingId}`;
          const busy = pendingKey === key;

          if (item.kind === "request") {
            const ctx = [item.placement, item.preferredDate]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.client}
                    </p>
                    <span className="shrink-0 rounded-full bg-brand-mustard/15 px-2 py-0.5 text-[11px] text-brand-mustard">
                      Pending
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {ctx || "New request"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {confirmKey === key ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(key, () => passRequestAction(item.bookingId))
                        }
                        className={BTN_DANGER}
                      >
                        {busy ? "…" : "Confirm pass"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmKey(null)}
                        className={BTN_GHOST}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(key, () => acceptRequestAction(item.bookingId))
                        }
                        className={BTN_PRIMARY}
                      >
                        {busy ? "…" : "Accept"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmKey(key)}
                        className={BTN_GHOST}
                      >
                        Pass
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          }

          // deposit
          return (
            <div
              key={key}
              className="flex items-center justify-between gap-3 py-3 first:pt-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.client}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                      item.overdue
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.overdue ? "Overdue deposit" : "Awaiting deposit"}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {money(item.amount, item.currency)}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(key, () => markDepositReceivedAction(item.bookingId))
                }
                className={`${BTN_PRIMARY} inline-flex items-center gap-1.5`}
              >
                <Banknote className="h-3.5 w-3.5" aria-hidden />
                {busy ? "…" : "Mark received"}
              </button>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Link
        href="/bookings"
        className="block text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        View all in Bookings →
      </Link>
    </Card>
  );
}
