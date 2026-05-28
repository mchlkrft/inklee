"use client";

import { useActionState } from "react";
import { saveClientNotesAction } from "./actions";

type State = { error: string } | { success: true } | null;

export default function NotesEditor({
  customerEmail,
  defaultNotes,
}: {
  customerEmail: string;
  defaultNotes: string;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveClientNotesAction,
    null,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="customer_email" value={customerEmail} />
      <textarea
        name="notes"
        defaultValue={defaultNotes}
        rows={5}
        placeholder="Private notes - only visible to you"
        className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
      />
      <div className="flex items-center justify-between">
        {state && "error" in state && (
          <p className="text-xs text-destructive">{state.error}</p>
        )}
        {state && "success" in state && (
          <p className="text-xs text-muted-foreground">Saved.</p>
        )}
        {!state && <span />}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-mustard px-4 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save notes"}
        </button>
      </div>
    </form>
  );
}
