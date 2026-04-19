"use client";

import { useOptimistic, useState, startTransition } from "react";
import {
  approveBooking,
  rejectBooking,
  markDepositPending,
} from "../../actions";
import StatusBadge from "@/components/status-badge";

type Booking = {
  id: string;
  status: string;
};

export default function StatusActions({ booking }: { booking: Booking }) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(booking.status);
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    action: (id: string) => Promise<{ error: string } | { success: true }>,
    nextStatus: string,
  ) => {
    setError(null);
    startTransition(async () => {
      setOptimisticStatus(nextStatus);
      const result = await action(booking.id);
      if ("error" in result) {
        setOptimisticStatus(booking.status);
        setError(result.error);
      }
    });
  };

  const isDone = ["approved", "rejected", "cancelled"].includes(
    optimisticStatus,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">status</span>
        <StatusBadge status={optimisticStatus} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!isDone && (
        <div className="flex flex-col gap-2">
          {optimisticStatus !== "approved" && (
            <button
              onClick={() => run(approveBooking, "approved")}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              approve
            </button>
          )}

          {optimisticStatus !== "deposit_pending" && (
            <button
              onClick={() => run(markDepositPending, "deposit_pending")}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/30 transition-colors"
            >
              mark deposit pending
            </button>
          )}

          {!confirmReject ? (
            <button
              onClick={() => setConfirmReject(true)}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
            >
              reject
            </button>
          ) : (
            <div className="rounded-md border border-destructive/50 p-3 space-y-2">
              <p className="text-sm text-foreground">reject this request?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    run(rejectBooking, "rejected");
                    setConfirmReject(false);
                  }}
                  className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white"
                >
                  yes, reject
                </button>
                <button
                  onClick={() => setConfirmReject(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
