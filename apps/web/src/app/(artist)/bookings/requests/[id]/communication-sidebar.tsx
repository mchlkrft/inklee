"use client";

import { useTransition, useState } from "react";
import {
  Check,
  CheckCircle2,
  X,
  Ban,
  Mail,
  Bell,
  Pencil,
  Inbox,
  Circle,
  type LucideIcon,
} from "lucide-react";
import {
  sendManualDepositReminderAction,
  sendManualReconfirmationAction,
} from "@/app/(artist)/settings/reminders/actions";

type LogEntry = {
  action: string;
  timestamp: string;
  details: Record<string, unknown>;
};

type Described = { label: string; Icon: LucideIcon; pill: string };

// Pill styles reuse the status-chip language: solid brand fills with legible
// text on the bone workspace.
const PILL = {
  green: "bg-brand-green text-brand-bone",
  red: "bg-brand-red text-brand-bone",
  rosa: "bg-brand-rosa text-brand-charcoal",
  mustard: "bg-brand-mustard text-brand-charcoal",
  charcoal: "bg-brand-charcoal text-brand-bone",
  muted: "bg-brand-charcoal/10 text-brand-charcoal",
} as const;

// Translate a raw audit-log row into artist-facing language + an icon + colour.
// Returns null for internal plumbing the artist shouldn't see (e.g. magic-link
// token rotation).
function describe(entry: LogEntry): Described | null {
  switch (entry.action) {
    case "token_rotated":
      return null; // internal magic-link housekeeping — not communication
    case "booking_created":
      return { label: "Booking submitted", Icon: Inbox, pill: PILL.charcoal };
    case "customer_edited":
      return {
        label: "Client updated their request",
        Icon: Pencil,
        pill: PILL.charcoal,
      };
    case "customer_cancelled":
      return { label: "Cancelled by client", Icon: Ban, pill: PILL.red };
    case "deposit_paid":
      return { label: "Deposit paid", Icon: CheckCircle2, pill: PILL.green };
    case "reminder_sent": {
      const manual = entry.details?.manual === true;
      return {
        label: manual ? "Reminder sent (manual)" : "Reminder sent",
        Icon: Bell,
        pill: PILL.mustard,
      };
    }
    case "status_changed": {
      const to = String(entry.details?.to ?? "");
      if (to === "approved")
        return { label: "Accepted", Icon: Check, pill: PILL.green };
      if (to === "rejected")
        return { label: "Passed", Icon: X, pill: PILL.red };
      if (to === "deposit_pending")
        // The deposit request triggers the customer email, so this row's date
        // is the deposit-request mail date.
        return { label: "Deposit requested", Icon: Mail, pill: PILL.rosa };
      if (to === "cancelled")
        return { label: "Cancelled", Icon: Ban, pill: PILL.muted };
      return { label: "Status updated", Icon: Circle, pill: PILL.muted };
    }
    default:
      return null; // unknown internal actions stay hidden
  }
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

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

  const events = log
    .map((entry) => ({ entry, described: describe(entry) }))
    .filter(
      (e): e is { entry: LogEntry; described: Described } =>
        e.described !== null,
    );

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

      {events.length > 0 ? (
        <ol className="space-y-3">
          {events.map(({ entry, described }, i) => {
            const { label, Icon, pill } = described;
            return (
              <li key={i} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${pill}`}
                >
                  <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-tight text-foreground">
                    {label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatWhen(entry.timestamp)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      )}
    </div>
  );
}
