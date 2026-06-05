"use client";

import { useActionState } from "react";
import { RefreshCcw } from "lucide-react";
import { syncConnectAccountAction } from "./actions";
import type { ConnectStatus } from "@/lib/stripe-connect";

type SyncState = { ok: true; status: ConnectStatus } | { error: string } | null;

/**
 * "Refresh status" control — re-syncs the Connect account with Stripe while
 * verification is in progress. Only the boolean `hasAccount` is passed in (not
 * the raw `acct_…` id) so the account id is never serialized into the client.
 */
export default function PayoutsControls({
  hasAccount,
}: {
  hasAccount: boolean;
}) {
  const [syncState, syncAction, syncPending] = useActionState<
    SyncState,
    FormData
  >(syncConnectAccountAction, null);

  if (!hasAccount) return null;

  return (
    <div className="space-y-2">
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
      {syncState && "error" in syncState && (
        <p className="text-sm text-destructive">{syncState.error}</p>
      )}
      {syncState && "ok" in syncState && (
        <p className="text-sm text-muted-foreground">
          Status is now {syncState.status}.
        </p>
      )}
    </div>
  );
}
