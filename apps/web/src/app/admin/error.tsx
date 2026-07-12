"use client";

import { useEffect } from "react";

/** Error boundary for the whole admin area (there was none; errors fell
 *  through to the root boundary and lost the admin context). */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs text-muted-foreground">Admin</p>
        <div className="mt-6 rounded-md border border-brand-red/40 bg-brand-red/10 p-5 space-y-3">
          <h1 className="text-lg font-semibold text-foreground">
            This admin page failed to load
          </h1>
          <p className="text-sm text-muted-foreground">
            The error has been logged to the console. Try again, or reload the
            page if it persists.
            {error.digest ? ` Digest: ${error.digest}` : ""}
          </p>
          <button
            onClick={reset}
            className="rounded-full bg-brand-mustard px-4 py-1.5 text-sm font-medium text-brand-charcoal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
