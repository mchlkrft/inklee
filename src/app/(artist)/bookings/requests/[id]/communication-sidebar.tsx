"use client";

import { useTransition, useState } from "react";
import { relativeTime } from "@/lib/format";
import {
  sendManualDepositReminderAction,
  sendManualReconfirmationAction,
} from "@/app/(artist)/settings/reminders/actions";

type LogEntry = {
  timestamp: string;
  details: Record<string, unknown>;
};

export default function CommunicationSidebar({
  bookingId,
  status,
  hasDepositDueDate,
  hasMagicLink,
  hasUpcomingDate,
  log,
}: {
  bookingId: string;
  status: string;
  hasDepositDueDate: boolean;
  hasMagicLink: boolean;
  hasUpcomingDate: boolean;
  log: LogEntry[];
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function act(
    fn: () => Promise<{ error: string } | { success: true } | null>,
  ) {
    setFeedback(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result) setFeedback(result.error);
      else setFeedback("Sent.");
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  const canSendDepositReminder =
    status === "deposit_pending" && hasDepositDueDate;
  const canSendReconfirmation =
    status === "approved" && hasMagicLink && hasUpcomingDate;
  const hasActions = canSendDepositReminder || canSendReconfirmation;

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Communication
      </p>

      {hasActions && (
        <div className="flex flex-col gap-2">
          {canSendDepositReminder && (
            <button
              onClick={() =>
                act(() => sendManualDepositReminderAction(bookingId))
              }
              disabled={pending}
              className="text-left text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {pending ? "Sending..." : "Send deposit reminder"}
            </button>
          )}
          {canSendReconfirmation && (
            <button
              onClick={() =>
                act(() => sendManualReconfirmationAction(bookingId))
              }
              disabled={pending}
              className="text-left text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {pending ? "Sending..." : "Send reconfirmation"}
            </button>
          )}
          {feedback && (
            <p className="text-xs text-muted-foreground">{feedback}</p>
          )}
        </div>
      )}

      {log.length > 0 ? (
        <div className="space-y-1.5">
          {log.map((entry, i) => {
            const type = String(entry.details?.type ?? "reminder");
            const isManual = entry.details?.manual === true;
            const rawLabel =
              type.replace(/_/g, " ") + (isManual ? " (manual)" : "");
            const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
            return (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-muted-foreground/60 shrink-0 ml-2">
                  {relativeTime(entry.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No reminders sent yet.</p>
      )}
    </div>
  );
}
