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
import {
  describeBookingActivity,
  type BookingActivityKind,
} from "@inklee/shared/booking-activity";

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

// Icon + pill per activity kind; the kinds and artist-facing labels live in
// @inklee/shared/booking-activity, shared with the mobile API so the two
// surfaces can't drift on copy.
const KIND_VISUALS: Record<
  BookingActivityKind,
  { Icon: LucideIcon; pill: string }
> = {
  submitted: { Icon: Inbox, pill: PILL.charcoal },
  client_edited: { Icon: Pencil, pill: PILL.charcoal },
  client_cancelled: { Icon: Ban, pill: PILL.red },
  deposit_paid: { Icon: CheckCircle2, pill: PILL.green },
  reminder: { Icon: Bell, pill: PILL.mustard },
  accepted: { Icon: Check, pill: PILL.green },
  passed: { Icon: X, pill: PILL.red },
  deposit_requested: { Icon: Mail, pill: PILL.rosa },
  cancelled: { Icon: Ban, pill: PILL.muted },
  status_other: { Icon: Circle, pill: PILL.muted },
};

// Translate a raw audit-log row into artist-facing language + an icon + colour.
// Returns null for internal plumbing the artist shouldn't see (e.g. magic-link
// token rotation).
function describe(entry: LogEntry): Described | null {
  const d = describeBookingActivity(entry.action, entry.details ?? {});
  if (!d) return null;
  return { label: d.label, ...KIND_VISUALS[d.kind] };
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
