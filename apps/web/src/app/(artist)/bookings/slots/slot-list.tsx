"use client";

import { startTransition, useState } from "react";
import { deleteSlotAction } from "./actions";
import { slotStatusLabel } from "@inklee/shared/status-labels";
import StatusBadge from "@/components/status-badge";

type Slot = {
  id: string;
  date: string;
  time: string;
  tz: string;
  status: string;
};

export default function SlotList({ slots }: { slots: Slot[] }) {
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteSlotAction(id);
      if ("success" in result) setDeleted((s) => new Set([...s, id]));
    });
  };

  const visible = slots.filter((s) => !deleted.has(s.id));

  if (visible.length === 0) {
    return (
      <div className="rounded-md border border-border px-5 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          no slots yet. add one above.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border divide-y divide-border">
      {visible.map((slot) => (
        <div
          key={slot.id}
          className="flex items-center justify-between px-4 py-3"
        >
          <div>
            <p className="text-sm text-foreground">{slot.date}</p>
            <p className="text-xs text-muted-foreground">
              {slot.time} · {slot.tz}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge
              status={slot.status}
              label={slotStatusLabel(slot.status)}
            />
            {slot.status === "open" && (
              <button
                onClick={() => handleDelete(slot.id)}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
