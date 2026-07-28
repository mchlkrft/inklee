"use client";

import { useActionState, useState } from "react";
import Spinner from "@/components/spinner";
import { renameSlugAction } from "./slug-actions";

type State = { error: string } | { success: true; slug: string } | null;

export default function SlugForm({
  currentSlug,
  entitled,
  publicHost,
}: {
  currentSlug: string;
  entitled: boolean;
  /** Displayed prefix, e.g. "inkl.ee/". Presentational only. */
  publicHost: string;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    renameSlugAction,
    null,
  );
  const [slug, setSlug] = useState(currentSlug);
  const [confirming, setConfirming] = useState(false);

  const changed = slug.trim().toLowerCase() !== currentSlug;

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="slug" className="text-sm text-muted-foreground">
          Your link
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{publicHost}</span>
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setConfirming(false);
            }}
            maxLength={30}
            disabled={!entitled}
            className="flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
          />
        </div>
      </div>

      {!entitled && (
        <p className="text-xs text-muted-foreground">
          Changing your link is part of Plus.
        </p>
      )}

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-brand-green">
          Your page is now at {publicHost}
          {state.slug}
        </p>
      )}

      {entitled && changed && (
        <div className="space-y-2 rounded-md border border-border p-3">
          {/* The consequence, stated before the click rather than after it.
              Nothing redirects the old address, so every link an artist has
              already shared stops working. */}
          <p className="text-sm text-foreground">
            Your old link {publicHost}
            {currentSlug} will stop working.
          </p>
          <p className="text-xs text-muted-foreground">
            Anyone with the old address, including your Instagram bio and any
            printed cards or codes, will need the new one.
          </p>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirming}
              onChange={(e) => setConfirming(e.target.checked)}
              className="accent-foreground"
            />
            <span className="text-sm text-muted-foreground">
              I understand, update my link
            </span>
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !entitled || !changed || !confirming}
        className="rounded-full bg-brand-mustard px-5 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Change link"}
      </button>
    </form>
  );
}
