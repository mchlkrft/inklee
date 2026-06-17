"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FlashQuickCreateModal from "./flash-quick-create-modal";

/**
 * "+ New design" entry point on /flash/items.
 *
 * Two-step flow:
 * 1. Click → fork modal asks "Pick from Instagram" vs "Upload manually".
 * 2a. Instagram  → navigates to /flash/instagram.
 * 2b. Manually   → opens the lightweight `FlashQuickCreateModal` inline,
 *                   no navigation. Image-first, optional title/price,
 *                   everything else behind a "More settings" disclosure.
 */
export default function FlashNewItemButton({
  igConnected,
  igPostCount,
}: {
  igConnected: boolean;
  igPostCount: number;
}) {
  const [forkOpen, setForkOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  // Escape dismisses the fork modal (quick-create handles its own).
  useEffect(() => {
    if (!forkOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setForkOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [forkOpen]);

  const instagramSubtitle = igConnected
    ? igPostCount > 0
      ? `Choose from ${igPostCount} synced post${igPostCount === 1 ? "" : "s"}`
      : "Resync to fetch your latest posts"
    : "Connect your account first — fastest way to add many designs";

  return (
    <>
      <button
        type="button"
        onClick={() => setForkOpen(true)}
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal"
      >
        + New design
      </button>

      {forkOpen && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setForkOpen(false)}
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
                  onClick={() => setForkOpen(false)}
                  className="block rounded-md border border-border p-4 transition-colors hover:border-foreground/40 hover:bg-[color:var(--color-workspace-hover)]"
                >
                  <p className="text-sm font-medium text-foreground">
                    Pick from Instagram
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {instagramSubtitle}
                  </p>
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setForkOpen(false);
                    setQuickOpen(true);
                  }}
                  className="block w-full rounded-md border border-border p-4 text-left transition-colors hover:border-foreground/40 hover:bg-[color:var(--color-workspace-hover)]"
                >
                  <p className="text-sm font-medium text-foreground">
                    Upload manually
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Add a custom design with your own image and details.
                  </p>
                </button>
              </div>

              <div className="flex justify-end border-t border-border px-6 py-3">
                <button
                  type="button"
                  onClick={() => setForkOpen(false)}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {quickOpen && (
        <FlashQuickCreateModal onClose={() => setQuickOpen(false)} />
      )}
    </>
  );
}
