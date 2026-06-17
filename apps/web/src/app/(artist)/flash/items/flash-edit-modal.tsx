"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Spinner from "@/components/spinner";
import { loadFlashItemForEditAction } from "./actions";
import FlashItemForm, { type InitialValues } from "./flash-item-form";

type Loaded = { initial: InitialValues };

// Inline edit modal for /flash/items (78f/DT-16) — opened from a grid tile
// instead of navigating to the /flash/items/[id] subpage. Mirrors the goods
// edit modal chrome; the tile only has thumbnail data, so the full item +
// flash days are fetched when it opens. Reuses the existing FlashItemForm
// (which brings its own form + submit) and closes on a successful save.
export default function FlashEditModal({
  itemId,
  onClose,
}: {
  itemId: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadFlashItemForEditAction(itemId).then((res) => {
      if (!active) return;
      if ("error" in res) setLoadError(res.error);
      else setLoaded(res);
    });
    return () => {
      active = false;
    };
  }, [itemId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="flash-edit-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2
              id="flash-edit-title"
              className="text-sm font-medium text-foreground"
            >
              Edit flash design
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : !loaded ? (
              <div className="flex justify-center py-10">
                <Spinner className="h-5 w-5" />
              </div>
            ) : (
              <FlashItemForm initial={loaded.initial} onSuccess={onClose} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
