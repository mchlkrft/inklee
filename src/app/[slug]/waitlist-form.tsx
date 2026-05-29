"use client";

import { useActionState, useState } from "react";
import { HONEYPOT_FIELD } from "@/lib/honeypot";
import { submitWaitlistAction, type WaitlistState } from "./actions";

export default function WaitlistForm({ artistSlug }: { artistSlug: string }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(
    submitWaitlistAction,
    null,
  );
  const [note, setNote] = useState("");
  const [city, setCity] = useState("");

  if (state && "ok" in state) {
    return (
      <p className="text-sm text-muted-foreground">
        Got it — we&apos;ll email you when there&apos;s an opening.
      </p>
    );
  }

  const err = (field: string) =>
    state && "error" in state && state.field === field ? state.error : null;

  return (
    <form action={action} className="space-y-3 text-left">
      <input type="hidden" name="artist_slug" value={artistSlug} />
      <input
        name={HONEYPOT_FIELD}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-px w-px overflow-hidden -left-[9999px] top-auto"
      />

      {state && "error" in state && !state.field && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}

      <div className="space-y-1">
        <label htmlFor="wl_handle" className="text-xs text-muted-foreground">
          Instagram handle <span className="text-foreground">*</span>
        </label>
        <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
          <span className="select-none text-muted-foreground">@</span>
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
          Email <span className="text-foreground">*</span>
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
        <label htmlFor="wl_city" className="text-xs text-muted-foreground">
          Your city / location{" "}
          <span className="text-xs text-muted-foreground">(optional)</span>
        </label>
        <input
          id="wl_city"
          name="city_text"
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Berlin, Amsterdam, New York…"
          maxLength={100}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Tell the artist where you&apos;d like to get tattooed — helps them
          plan future guest spots.
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <label htmlFor="wl_note" className="text-xs text-muted-foreground">
            Brief note{" "}
            <span className="text-xs text-muted-foreground">(optional)</span>
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
          placeholder="What are you looking for?"
          className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {err("note") && (
          <p className="text-xs text-destructive">{err("note")}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full border border-border px-5 py-2.5 text-sm text-foreground transition-colors hover:border-foreground disabled:opacity-50"
      >
        {pending ? "Joining..." : "Join the waitlist"}
      </button>
    </form>
  );
}
