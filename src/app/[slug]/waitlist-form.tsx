"use client";

import { useActionState } from "react";
import { submitWaitlistAction, type WaitlistState } from "./actions";
import { useState } from "react";

export default function WaitlistForm({ artistSlug }: { artistSlug: string }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(
    submitWaitlistAction,
    null,
  );
  const [note, setNote] = useState("");

  if (state && "ok" in state) {
    return (
      <p className="text-sm text-muted-foreground">
        got it — we&apos;ll be in touch when books open.
      </p>
    );
  }

  const err = (field: string) =>
    state && "error" in state && state.field === field ? state.error : null;

  return (
    <form action={action} className="space-y-3 text-left">
      <input type="hidden" name="artist_slug" value={artistSlug} />
      <input
        name="website"
        type="text"
        tabIndex={-1}
        className="hidden"
        aria-hidden
      />

      {state && "error" in state && !state.field && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}

      <div className="space-y-1">
        <label htmlFor="wl_handle" className="text-xs text-muted-foreground">
          instagram handle <span className="text-foreground">*</span>
        </label>
        <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
          <span className="text-muted-foreground select-none">@</span>
          <input
            id="wl_handle"
            name="instagram_handle"
            type="text"
            required
            autoComplete="off"
            className="flex-1 bg-transparent text-foreground focus:outline-none"
          />
        </div>
        {err("instagram_handle") && (
          <p className="text-xs text-destructive">{err("instagram_handle")}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="wl_email" className="text-xs text-muted-foreground">
          email <span className="text-foreground">*</span>
        </label>
        <input
          id="wl_email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {err("email") && (
          <p className="text-xs text-destructive">{err("email")}</p>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <label htmlFor="wl_note" className="text-xs text-muted-foreground">
            brief note{" "}
            <span className="text-muted-foreground text-xs">(optional)</span>
          </label>
          <span
            className={`text-xs ${note.length > 280 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {note.length}/280
          </span>
        </div>
        <textarea
          id="wl_note"
          name="note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="what are you looking for?"
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        {err("note") && (
          <p className="text-xs text-destructive">{err("note")}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-border px-4 py-2.5 text-sm text-foreground hover:border-foreground transition-colors disabled:opacity-50"
      >
        {pending ? "joining…" : "join the waitlist"}
      </button>
    </form>
  );
}
