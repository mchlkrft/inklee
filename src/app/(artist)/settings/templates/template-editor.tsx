"use client";

import { useActionState, useState } from "react";
import { saveTemplateAction } from "./actions";

type State = { error: string } | { success: true } | null;

export default function TemplateEditor({
  type,
  defaultBody,
}: {
  type: string;
  defaultBody: string;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveTemplateAction,
    null,
  );
  const [body, setBody] = useState(defaultBody);

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
        className="w-full rounded-md border border-border bg-transparent px-3 py-2.5 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
      />

      <div className="flex items-center justify-between">
        <span
          className={`text-xs ${body.length > 2000 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {body.length}/2000
        </span>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? "saving…" : "save"}
        </button>
      </div>
    </form>
  );
}
