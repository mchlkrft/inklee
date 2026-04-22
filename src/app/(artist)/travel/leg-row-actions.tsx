"use client";

import { useTransition } from "react";
import { deleteTravelLegAction, toggleTravelLegAction } from "./actions";

export default function LegRowActions({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 shrink-0">
      <button
        onClick={() =>
          startTransition(() => toggleTravelLegAction(id, !isActive))
        }
        disabled={pending}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {isActive ? "deactivate" : "activate"}
      </button>
      <button
        onClick={() => startTransition(() => deleteTravelLegAction(id))}
        disabled={pending}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      >
        delete
      </button>
    </div>
  );
}
