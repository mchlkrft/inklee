"use client";

import { useActionState, useState, useTransition } from "react";
import { saveTemplateAction, toggleTemplateAction } from "./actions";

type EmailType =
  | "customer_booking_submitted"
  | "customer_booking_approved"
  | "customer_booking_rejected"
  | "customer_booking_cancelled_by_artist"
  | "artist_new_booking_request";

type State = { error: string } | { success: true } | null;

export default function TemplateEditor({
  type,
  defaultBody,
  defaultEnabled,
}: {
  type: EmailType;
  defaultBody: string;
  defaultEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveTemplateAction,
    null,
  );
  const [body, setBody] = useState(defaultBody);
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [toggling, startToggle] = useTransition();

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    startToggle(async () => {
      await toggleTemplateAction(type, next);
    });
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="type" value={type} />

      {state && "error" in state && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-xs text-green-500">saved</p>
      )}

      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        disabled={!enabled}
        className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y disabled:opacity-40 disabled:cursor-not-allowed"
      />

      <div className="flex items-center justify-between">
        <span
          className={`text-xs ${body.length > 2000 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {body.length}/2000
        </span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            disabled={toggling}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 ${
              enabled ? "bg-foreground" : "bg-border"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-xs text-muted-foreground">
            {enabled ? "on" : "off"}
          </span>
          <button
            type="submit"
            disabled={pending || !enabled}
            className="rounded-md bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
          >
            {pending ? "saving…" : "save"}
          </button>
        </div>
      </div>
    </form>
  );
}
