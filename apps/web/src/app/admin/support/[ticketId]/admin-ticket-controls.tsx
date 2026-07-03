"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { adminReplyAction, adminSetStatusAction } from "../actions";
import SelectInput from "@/components/select-input";
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  SUPPORT_LIMITS,
  type SupportStatus,
} from "@/lib/support";

type State = { error: string } | { ok: true } | null;

const COMPACT_TRIGGER =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

const STATUS_OPTIONS = SUPPORT_STATUSES.map((s) => ({
  value: s,
  label: SUPPORT_STATUS_LABELS[s],
}));

export function AdminReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action, pending] = useActionState<State, FormData>(
    adminReplyAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  // Internal notes never change status or notify, so the status picker is
  // disabled while the note toggle is on.
  const [internal, setInternal] = useState(false);

  useEffect(() => {
    if (state && "ok" in state) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      onReset={() => setInternal(false)}
      className="space-y-3"
    >
      <input type="hidden" name="ticket_id" value={ticketId} />
      <div className="space-y-1.5">
        <label
          htmlFor="admin-reply-body"
          className="text-sm font-medium text-foreground"
        >
          {internal ? "Add an internal note" : "Add a reply"}
        </label>
        <textarea
          id="admin-reply-body"
          name="body"
          required
          maxLength={SUPPORT_LIMITS.replyMax}
          placeholder={
            internal
              ? "Visible to admins only. The artist is not notified."
              : "Reply to the artist. This is sent as Inklee support."
          }
          className={`w-full min-h-[110px] resize-y rounded-md border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring ${
            internal ? "border-dashed border-brand-mustard/60" : "border-border"
          }`}
          rows={4}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            name="internal"
            value="1"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="accent-brand-mustard"
          />
          Internal note (admins only, no notification)
        </label>
        <div className="flex items-center gap-2">
          <label
            htmlFor="admin-reply-status"
            className={`text-xs ${internal ? "text-muted-foreground/50" : "text-muted-foreground"}`}
          >
            Status after reply:
          </label>
          <div className="w-52">
            <SelectInput
              id="admin-reply-status"
              name="set_status"
              disabled={internal}
              options={[
                { value: "", label: "Awaiting artist (default)" },
                ...STATUS_OPTIONS,
              ]}
              defaultValue=""
              className={COMPACT_TRIGGER}
            />
          </div>
        </div>
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
        {pending ? "Sending…" : internal ? "Save note" : "Send reply"}
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
      <div className="w-44">
        <SelectInput
          id="admin-status"
          name="status"
          options={STATUS_OPTIONS}
          defaultValue={currentStatus}
          className={COMPACT_TRIGGER}
        />
      </div>
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
