"use client";

import { useTransition } from "react";

type Props = {
  syncAction: () => Promise<void>;
  disconnectAction: () => Promise<void>;
};

export default function AccountActions({
  syncAction,
  disconnectAction,
}: Props) {
  const [syncing, startSync] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <form action={() => startSync(async () => await syncAction())}>
          <button
            type="submit"
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            {syncing && (
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin"
              />
            )}
            {syncing ? "Syncing…" : "Resync"}
          </button>
        </form>
        <form action={disconnectAction}>
          <button
            type="submit"
            disabled={syncing}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors disabled:opacity-60"
          >
            Disconnect
          </button>
        </form>
      </div>
      {syncing && (
        <p className="text-xs text-muted-foreground">
          Caching thumbnails — this can take a moment.
        </p>
      )}
    </div>
  );
}
