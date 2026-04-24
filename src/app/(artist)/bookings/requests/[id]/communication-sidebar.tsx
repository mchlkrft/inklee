"use client";

import { useTransition, useState } from "react";
import { relativeTime } from "@/lib/format";
import {
  sendManualDepositReminderAction,
  sendManualReconfirmationAction,
} from "@/app/(artist)/settings/reminders/actions";

type LogEntry = {
  action: string;
  timestamp: string;
  details: Record<string, unknown>;
};

const ACTION_LABELS: Record<string, string> = {
  booking_created: "Booking submitted",
  status_changed: "Status changed",
  reminder_sent: "Reminder sent",
  deposit_paid: "Deposit paid",
  customer_cancelled: "Cancelled by client",
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
            let label =
              ACTION_LABELS[entry.action] ?? entry.action.replace(/_/g, " ");
            if (entry.action === "status_changed") {
              const to = String(entry.details?.to ?? "");
              if (to) label = `→ ${to.replace(/_/g, " ")}`;
            }
            if (entry.action === "reminder_sent") {
              const type = String(entry.details?.type ?? "");
              const isManual = entry.details?.manual === true;
              label = `Reminder: ${type.replace(/_/g, " ")}${isManual ? " (manual)" : ""}`;
            }
            label = label.charAt(0).toUpperCase() + label.slice(1);
            return (
              <div key={i} className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-muted-foreground/60 shrink-0">
                  {relativeTime(entry.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No activity logged yet.</p>
      )}
    </div>
  );
}
