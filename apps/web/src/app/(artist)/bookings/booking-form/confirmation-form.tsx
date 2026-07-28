"use client";

import { useActionState, useState } from "react";
import {
  CONFIRMATION_HEADLINE_MAX,
  CONFIRMATION_MESSAGE_MAX,
  CONFIRMATION_LINK_LABEL_MAX,
  type ConfirmationPageSettings,
} from "@inklee/shared/confirmation-page";
import Spinner from "@/components/spinner";
import { saveConfirmationPageAction } from "./actions";

type State = { error: string } | { success: true } | null;

const INPUT =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

export default function ConfirmationForm({
  initial,
  entitled,
}: {
  initial: ConfirmationPageSettings;
  entitled: boolean;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveConfirmationPageAction,
    null,
  );
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl ?? "");

  return (
    <form action={action} className="space-y-4">
      {!entitled && (
        <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
          A custom confirmation page is part of Plus. Until then clients see the
          standard Inklee wording.
        </p>
      )}

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-brand-green">Saved.</p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="cp-headline" className="text-xs text-muted-foreground">
          Headline
        </label>
        <input
          id="cp-headline"
          name="headline"
          defaultValue={initial.headline ?? ""}
          maxLength={CONFIRMATION_HEADLINE_MAX}
          placeholder="Request sent"
          className={INPUT}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cp-message" className="text-xs text-muted-foreground">
          Message
        </label>
        <textarea
          id="cp-message"
          name="message"
          rows={3}
          defaultValue={initial.message ?? ""}
          maxLength={CONFIRMATION_MESSAGE_MAX}
          placeholder="Thanks, I'll come back to you within a few days."
          className={INPUT}
        />
        <p className="text-xs text-muted-foreground">
          Leave both empty to use the Inklee wording.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="cp-url" className="text-xs text-muted-foreground">
            Link (optional)
          </label>
          <input
            id="cp-url"
            name="linkUrl"
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://"
            className={INPUT}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cp-label" className="text-xs text-muted-foreground">
            Button text
          </label>
          <input
            id="cp-label"
            name="linkLabel"
            defaultValue={initial.linkLabel ?? ""}
            maxLength={CONFIRMATION_LINK_LABEL_MAX}
            placeholder="Read my aftercare guide"
            disabled={!linkUrl.trim()}
            className={`${INPUT} disabled:opacity-50`}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? <Spinner className="w-4 h-4 mx-auto" /> : "Save"}
      </button>
    </form>
  );
}
