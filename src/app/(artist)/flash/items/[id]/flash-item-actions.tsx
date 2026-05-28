"use client";

import { startTransition, useState } from "react";
import { archiveFlashItemAction, toggleFlashBookableAction } from "../actions";

type Item = { id: string; isBookable: boolean; status: string };

export default function FlashItemActions({ item }: { item: Item }) {
  const [bookable, setBookable] = useState(item.isBookable);
  const [archiving, setArchiving] = useState(false);

  function handleToggle() {
    const next = !bookable;
    setBookable(next);
    startTransition(async () => {
      await toggleFlashBookableAction(item.id, next);
    });
  }

  function handleArchive() {
    if (
      !confirm(
        "Archive this flash item? It will be hidden from your public page and closed to new bookings.",
      )
    )
      return;
    setArchiving(true);
    startTransition(async () => {
      await archiveFlashItemAction(item.id);
    });
  }

  if (item.status === "archived") {
    return (
      <p className="text-xs text-muted-foreground text-center">Archived</p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
      >
        {bookable ? "Pause bookings" : "Resume bookings"}
      </button>
      <button
        type="button"
        onClick={handleArchive}
        disabled={archiving}
        className="w-full rounded-full border border-border px-4 py-2.5 text-sm text-destructive hover:border-destructive transition-colors disabled:opacity-50"
      >
        {archiving ? "Archiving…" : "Archive item"}
      </button>
    </div>
  );
}
