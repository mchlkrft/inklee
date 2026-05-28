"use client";

import DateInput from "@/components/date-input";
import { useOptimistic, useState, useTransition } from "react";
import {
  approveBooking,
  rejectBooking,
  requestDeposit,
  markDepositReceived,
} from "../../actions";
import StatusBadge from "@/components/status-badge";

type Booking = {
  id: string;
  status: string;
};

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export default function StatusActions({ booking }: { booking: Booking }) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(booking.status);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showDepositForm, setShowDepositForm] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositDueAt, setDepositDueAt] = useState(tomorrow());
  const [depositNote, setDepositNote] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);

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

  const handleRequestDeposit = () => {
    const amount = parseFloat(depositAmount);
    if (!depositAmount || isNaN(amount) || amount <= 0) {
      setError("Enter a valid deposit amount");
      return;
    }
    if (!depositDueAt) {
      setError("Enter a due date");
      return;
    }
    setError(null);
    setShowDepositForm(false);
    startTransition(async () => {
      setOptimisticStatus("deposit_pending");
      const result = await requestDeposit(
        booking.id,
        amount,
        depositDueAt,
        depositNote.trim() || null,
      );
      if ("error" in result) {
        setOptimisticStatus(booking.status);
        setError(result.error);
      }
    });
  };

  const isDone = ["approved", "rejected", "cancelled"].includes(
    optimisticStatus,
  );
  const isDepositPending = optimisticStatus === "deposit_pending";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status</span>
        <StatusBadge status={optimisticStatus} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isDepositPending && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => run(markDepositReceived, "approved")}
            className="rounded-full bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal"
          >
            Mark deposit received
          </button>
          {!confirmReject ? (
            <button
              onClick={() => setConfirmReject(true)}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
            >
              Reject
            </button>
          ) : (
            <div className="rounded-md border border-destructive/50 p-3 space-y-2">
              <p className="text-sm text-foreground">Reject this request?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    run(rejectBooking, "rejected");
                    setConfirmReject(false);
                  }}
                  className="rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-white"
                >
                  Yes, reject
                </button>
                <button
                  onClick={() => setConfirmReject(false)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!isDone && !isDepositPending && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => run(approveBooking, "approved")}
            className="rounded-full bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal"
          >
            Approve
          </button>

          {!showDepositForm ? (
            <button
              onClick={() => setShowDepositForm(true)}
              className="rounded-full border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/30 transition-colors"
            >
              Request deposit
            </button>
          ) : (
            <div className="rounded-md border border-border p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">
                Request deposit
              </p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Amount *
                  </label>
                  <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
                    <span className="text-muted-foreground select-none mr-1">
                      EUR
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="200"
                      className="flex-1 bg-transparent text-foreground focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Due by *
                  </label>
                  <DateInput
                    value={depositDueAt}
                    min={tomorrow()}
                    onChange={(e) => setDepositDueAt(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Note to customer{" "}
                    <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={depositNote}
                    onChange={(e) => setDepositNote(e.target.value)}
                    placeholder="e.g. Bank transfer details or payment method"
                    maxLength={300}
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleRequestDeposit}
                  className="flex-1 rounded-full bg-brand-mustard px-3 py-1.5 text-xs font-medium text-brand-charcoal"
                >
                  Send deposit request
                </button>
                <button
                  onClick={() => {
                    setShowDepositForm(false);
                    setError(null);
                  }}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!confirmReject ? (
            <button
              onClick={() => setConfirmReject(true)}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
            >
              Reject
            </button>
          ) : (
            <div className="rounded-md border border-destructive/50 p-3 space-y-2">
              <p className="text-sm text-foreground">Reject this request?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    run(rejectBooking, "rejected");
                    setConfirmReject(false);
                  }}
                  className="rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-white"
                >
                  Yes, reject
                </button>
                <button
                  onClick={() => setConfirmReject(false)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
