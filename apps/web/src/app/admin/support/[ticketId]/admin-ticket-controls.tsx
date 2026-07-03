"use client";

import { useActionState, useEffect, useRef } from "react";
import { adminReplyAction, adminSetStatusAction } from "../actions";
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  SUPPORT_LIMITS,
  type SupportStatus,
} from "@/lib/support";

type State = { error: string } | { ok: true } | null;

const SELECT_CLS =
  "rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export function AdminReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState<State, FormData>(
    adminReplyAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "ok" in state) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <div className="space-y-1.5">
        <label
          htmlFor="admin-reply-body"
          className="text-sm font-medium text-foreground"
        >
          Add a reply
        </label>
        <textarea
          id="admin-reply-body"
          name="body"
          required
          maxLength={SUPPORT_LIMITS.replyMax}
          placeholder="Reply to the artist. This is sent as Inklee support."
          className="w-full min-h-[110px] resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          rows={4}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="internal" value="1" />
          Internal note (never visible to the artist, no notification)
        </label>
        <label
          htmlFor="admin-reply-status"
          className="text-xs text-muted-foreground"
        >
          Set status with reply:
        </label>
        <select
          id="admin-reply-status"
          name="set_status"
          defaultValue=""
          className={SELECT_CLS}
        >
          <option value="">Awaiting artist (default)</option>
          {SUPPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUPPORT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      {state && "error" in state && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send reply"}
      </button>
    </form>
  );
}

export function AdminStatusForm({
  ticketId,
  currentStatus,
}: {
  ticketId: string;
  currentStatus: SupportStatus;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    adminSetStatusAction,
    null,
  );

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <label htmlFor="admin-status" className="text-xs text-muted-foreground">
        Status:
      </label>
      <select
        id="admin-status"
        name="status"
        defaultValue={currentStatus}
        className={SELECT_CLS}
      >
        {SUPPORT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {SUPPORT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Apply"}
      </button>
      {state && "error" in state && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
