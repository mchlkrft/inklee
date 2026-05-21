"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * "+ New design" entry point on /flash/items.
 *
 * Clicking opens a modal that forks the creation path:
 * - "Pick from Instagram" → /flash/instagram (which handles connect / sync /
 *   pick states based on the artist's current setup)
 * - "Upload manually" → /flash/items/new (the existing full form)
 *
 * The modal subtitle for the Instagram option adapts to the artist's IG state
 * so the artist knows what they're walking into before tapping.
 */
export default function FlashNewItemButton({
  igConnected,
  igPostCount,
}: {
  igConnected: boolean;
  igPostCount: number;
}) {
  const [open, setOpen] = useState(false);

  // Escape dismisses
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const instagramSubtitle = igConnected
    ? igPostCount > 0
      ? `Choose from ${igPostCount} synced post${igPostCount === 1 ? "" : "s"}`
      : "Resync to fetch your latest posts"
    : "Connect your account first — fastest way to add many designs";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal"
      >
        + New design
      </button>

      {open && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="flash-new-item-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
              <div className="space-y-1 p-6">
                <h2
                  id="flash-new-item-title"
                  className="text-base font-semibold text-foreground"
                >
                  Add a flash design
                </h2>
                <p className="text-sm text-muted-foreground">
                  Pick how you want to add it.
                </p>
              </div>

              <div className="space-y-3 px-6 pb-6">
                <Link
                  href="/flash/instagram"
                  onClick={() => setOpen(false)}
                  className="block rounded-md border border-border p-4 transition-colors hover:border-foreground/40 hover:bg-[color:var(--color-workspace-hover)]"
                >
                  <p className="text-sm font-medium text-foreground">
                    Pick from Instagram
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {instagramSubtitle}
                  </p>
                </Link>

                <Link
                  href="/flash/items/new"
                  onClick={() => setOpen(false)}
                  className="block rounded-md border border-border p-4 transition-colors hover:border-foreground/40 hover:bg-[color:var(--color-workspace-hover)]"
                >
                  <p className="text-sm font-medium text-foreground">
                    Upload manually
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Add a custom design with your own image and details.
                  </p>
                </Link>
              </div>

              <div className="flex justify-end border-t border-border px-6 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
