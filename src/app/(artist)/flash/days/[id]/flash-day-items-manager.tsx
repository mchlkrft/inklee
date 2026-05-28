"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  attachFlashItemsToDayAction,
  detachFlashItemFromDayAction,
} from "../actions";

type Item = {
  id: string;
  title: string;
  status: string;
  preview_image_url: string | null;
};

/**
 * Two-section manager rendered below the form on /flash/days/[id].
 *
 * - "Attached designs" — flash items currently linked to this day. Each row
 *   has a detach affordance.
 * - "Attach designs" — flash items in the artist's library not yet linked.
 *   Multi-select tile grid + single round-trip attach button.
 */
export default function FlashDayItemsManager({
  dayId,
  linked,
  unattached,
}: {
  dayId: string;
  linked: Item[];
  unattached: Item[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAttach() {
    if (selected.size === 0) return;
    const ids = [...selected];
    startTransition(async () => {
      setError(null);
      const result = await attachFlashItemsToDayAction(dayId, ids);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        setSelected(new Set());
      }
    });
  }

  function handleDetach(itemId: string) {
    startTransition(async () => {
      setError(null);
      const result = await detachFlashItemFromDayAction(dayId, itemId);
      if (result && "error" in result) setError(result.error);
    });
  }

  if (linked.length === 0 && unattached.length === 0) {
    return (
      <p className="rounded-md border border-border px-6 py-8 text-center text-sm text-muted-foreground">
        No designs in your library yet.{" "}
        <Link
          href="/flash/items"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Add designs on the Designs page
        </Link>
        , then attach them here.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Attached designs ── */}
      {linked.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground border-b border-border pb-2">
            Attached designs ({linked.length})
          </h2>
          <ul className="overflow-hidden rounded-md border border-border divide-y divide-border">
            {linked.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {item.preview_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.preview_image_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded bg-muted/60" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {item.status}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    href={`/flash/items/${item.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDetach(item.id)}
                    disabled={pending}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Attach more ── */}
      {unattached.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
            <h2 className="text-base font-semibold text-foreground">
              Attach designs
            </h2>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={handleAttach}
                disabled={pending}
                className="rounded-full bg-brand-mustard px-3 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50"
              >
                {pending ? "Attaching…" : `Attach ${selected.size}`}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Pick designs from your library to add to this day.
          </p>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {unattached.map((item) => {
              const isSelected = selected.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    className={`relative block aspect-square w-full overflow-hidden rounded-md border-2 transition-colors ${
                      isSelected
                        ? "border-foreground"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    {item.preview_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.preview_image_url}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                        No image
                      </div>
                    )}
                    {isSelected && (
                      <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                        ✓
                      </span>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1 pt-4">
                      <p className="truncate text-[10px] text-white">
                        {item.title}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
