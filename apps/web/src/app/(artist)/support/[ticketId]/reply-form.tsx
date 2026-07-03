"use client";

import { useActionState, useEffect, useRef } from "react";
import { replyToTicketAction } from "../actions";
import { SUPPORT_LIMITS } from "@/lib/support";

type State = { error: string } | { ok: true } | null;

export default function ReplyForm({
  ticketId,
  resolved,
}: {
  ticketId: string;
  resolved: boolean;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    replyToTicketAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the composer after a successful reply; the thread above re-renders
  // with the new message via revalidatePath.
  useEffect(() => {
    if (state && "ok" in state) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <div className="space-y-1.5">
        <label
          htmlFor="support-reply"
          className="text-sm font-medium text-foreground"
        >
          Add a reply
        </label>
        {resolved && (
          <p className="text-xs text-muted-foreground">
            This ticket is resolved. Replying reopens it for the Inklee team.
          </p>
        )}
        <textarea
          id="support-reply"
          name="body"
          required
          maxLength={SUPPORT_LIMITS.replyMax}
          placeholder="Provide additional information or answer a question from the team."
          className="w-full min-h-[110px] resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          rows={4}
        />
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
