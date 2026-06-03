"use client";

import { useActionState } from "react";
import { ArrowRight, RefreshCcw } from "lucide-react";
import {
  startConnectOnboardingAction,
  syncConnectAccountAction,
} from "./actions";
import type { ConnectStatus } from "@/lib/stripe-connect";
import {
  CONNECT_COUNTRIES,
  DEFAULT_CONNECT_COUNTRY,
} from "@/lib/connect-countries";

type StartState = { error: string } | null;
type SyncState = { ok: true; status: ConnectStatus } | { error: string } | null;

export default function PayoutsControls({
  status,
  accountId,
}: {
  status: ConnectStatus;
  accountId: string | null;
}) {
  const [startState, startAction, startPending] = useActionState<
    StartState,
    FormData
  >(startConnectOnboardingAction, null);
  const [syncState, syncAction, syncPending] = useActionState<
    SyncState,
    FormData
  >(syncConnectAccountAction, null);

  const showStart = status === "unset" || status === "pending";
  const showSync = accountId !== null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {showStart && (
        <form action={startAction} className="space-y-3">
          {status === "unset" && (
            // F9: the connected account's country is locked at creation, so we
            // collect it here before the first onboarding. Hidden when resuming
            // a pending account (the account — and its country — already exist).
            <div className="max-w-xs space-y-1">
              <label
                htmlFor="connect-country"
                className="text-xs font-medium text-muted-foreground"
              >
                Your country
              </label>
              <select
                id="connect-country"
                name="country"
                defaultValue={DEFAULT_CONNECT_COUNTRY}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {CONNECT_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Where your business is based. This can&apos;t be changed after
                you connect.
              </p>
            </div>
          )}
          <button
            type="submit"
            disabled={startPending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {startPending
              ? "Opening Stripe…"
              : status === "pending"
                ? "Continue onboarding"
                : "Connect Stripe"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </form>
      )}

      {showSync && (
        <form action={syncAction}>
          <button
            type="submit"
            disabled={syncPending}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
          >
            <RefreshCcw
              className={`h-4 w-4 ${syncPending ? "animate-spin" : ""}`}
              aria-hidden
            />
            {syncPending ? "Checking with Stripe…" : "Refresh status"}
          </button>
        </form>
      )}

      {startState && "error" in startState && (
        <p className="basis-full text-sm text-destructive">
          {startState.error}
        </p>
      )}
      {syncState && "error" in syncState && (
        <p className="basis-full text-sm text-destructive">{syncState.error}</p>
      )}
      {syncState && "ok" in syncState && (
        <p className="basis-full text-sm text-muted-foreground">
          Status is now {syncState.status}.
        </p>
      )}
    </div>
  );
}
