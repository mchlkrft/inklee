"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  saveTemplateAction,
  toggleTemplateAction,
  resetTemplateAction,
} from "./actions";
import Spinner from "@/components/spinner";

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
  systemDefault,
  defaultEnabled,
  onSaveSuccess,
}: {
  type: EmailType;
  defaultBody: string;
  systemDefault: string;
  defaultEnabled: boolean;
  onSaveSuccess?: () => void;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveTemplateAction,
    null,
  );
  const [body, setBody] = useState(defaultBody);
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [toggling, startToggle] = useTransition();
  const [resetting, startReset] = useTransition();
  const [confirmingReset, setConfirmingReset] = useState(false);

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    startToggle(async () => {
      await toggleTemplateAction(type, next);
    });
  }

  function handleReset() {
    setConfirmingReset(false);
    startReset(async () => {
      await resetTemplateAction(type);
      setBody(systemDefault);
    });
  }

  const isCustomised = body !== systemDefault;

  // Close modal 700ms after a successful save so the user sees "Saved."
  useEffect(() => {
    if (state && "success" in state && onSaveSuccess) {
      const t = setTimeout(onSaveSuccess, 700);
      return () => clearTimeout(t);
    }
  }, [state, onSaveSuccess]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="type" value={type} />

      {state && "error" in state && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-xs text-green-500">Saved.</p>
      )}

      <textarea
        name="body"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setConfirmingReset(false);
        }}
        rows={8}
        disabled={!enabled}
        className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y disabled:opacity-40 disabled:cursor-not-allowed"
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span
          className={`text-xs ${body.length > 2000 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {body.length}/2000
        </span>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Reset to default */}
          {isCustomised && !confirmingReset && (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              disabled={resetting || !enabled}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors disabled:opacity-40"
            >
              Reset to default
            </button>
          )}
          {confirmingReset && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Restore system default?
              </span>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="text-xs text-destructive hover:underline disabled:opacity-50"
              >
                {resetting ? "Resetting…" : "Yes, reset"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Enable toggle */}
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
            {enabled ? "On" : "Off"}
          </span>

          {/* Save */}
          <button
            type="submit"
            disabled={pending || !enabled}
            className="rounded-md bg-brand-mustard px-4 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50"
          >
            {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
