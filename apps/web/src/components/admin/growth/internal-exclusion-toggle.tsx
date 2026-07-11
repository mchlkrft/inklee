"use client";

import { useEffect, useState } from "react";

/** Same marker the collector (public-analytics/collector.ts), the Plausible
 *  helper (lib/track.ts), and the ?internal=1 query flag all share. */
const INTERNAL_KEY = "inklee_internal";

/** A mirrored first-party cookie so SERVER-recorded conversions (signup,
 *  booking, beta invite) can also skip this browser: the collector's
 *  localStorage marker is invisible to server actions. Cleared alongside it. */
function setInternalCookie(on: boolean): void {
  try {
    document.cookie = on
      ? "inklee_internal=1; Max-Age=63072000; Path=/; SameSite=Lax"
      : "inklee_internal=; Max-Age=0; Path=/; SameSite=Lax";
  } catch {
    // cookies blocked: localStorage marker still covers client-side sends
  }
}

/**
 * Per-browser analytics exclusion control for the growth settings page.
 * Purely client-side: the marker lives in this browser's localStorage, so
 * the state shown here is about THIS browser only, not the account.
 */
export default function InternalExclusionToggle() {
  // null until the first client effect reads localStorage (avoids a
  // server/client hydration mismatch on the status line).
  const [excluded, setExcluded] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- standard "read external store after hydration" seed
      setExcluded(window.localStorage.getItem(INTERNAL_KEY) === "1");
    } catch {
      // Storage blocked: the collector treats this browser as counted.

      setExcluded(false);
    }
  }, []);

  function toggle() {
    try {
      if (excluded) {
        window.localStorage.removeItem(INTERNAL_KEY);
        setInternalCookie(false);
        setExcluded(false);
      } else {
        window.localStorage.setItem(INTERNAL_KEY, "1");
        setInternalCookie(true);
        setExcluded(true);
      }
    } catch {
      // Storage blocked: nothing to write, state stays as read.
    }
  }

  return (
    <div className="rounded-md border border-border p-5 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          {excluded === null
            ? "Checking this browser…"
            : excluded
              ? "This browser is excluded from analytics."
              : "This browser is being counted."}
        </p>
        <button
          type="button"
          onClick={toggle}
          disabled={excluded === null}
          className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {excluded ? "Count this browser" : "Exclude this browser"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Exclusion applies immediately and also suppresses the Plausible
        conversion events (same marker); the collector never sends anything from
        an excluded browser. The marker is per browser: set it on every device
        you use, or open any page with ?internal=1 (clear with ?internal=0).
      </p>
    </div>
  );
}
