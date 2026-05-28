"use client";

import { useActionState, useState } from "react";
import { saveGeneralAction, requestEmailChangeAction } from "./actions";

type State = { error: string } | { success: true } | null;

interface GeneralFormProps {
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string;
}

export default function GeneralForm({
  firstName,
  lastName,
  displayName,
  email,
}: GeneralFormProps) {
  const [nameState, nameAction, namePending] = useActionState<State, FormData>(
    saveGeneralAction,
    null,
  );
  const [emailState, emailAction, emailPending] = useActionState<
    State,
    FormData
  >(requestEmailChangeAction, null);
  const [showEmailForm, setShowEmailForm] = useState(false);

  return (
    <div className="space-y-8">
      <form action={nameAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="first_name"
              className="text-sm text-muted-foreground"
            >
              First name
            </label>
            <input
              id="first_name"
              name="first_name"
              type="text"
              defaultValue={firstName ?? ""}
              placeholder="e.g. Bert"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="last_name"
              className="text-sm text-muted-foreground"
            >
              Last name
            </label>
            <input
              id="last_name"
              name="last_name"
              type="text"
              defaultValue={lastName ?? ""}
              placeholder="e.g. Grimm"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="display_name"
            className="text-sm text-muted-foreground"
          >
            Artist name <span className="text-foreground">*</span>
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            defaultValue={displayName}
            required
            placeholder="Shown on your public booking page"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            This is the name your clients see.
          </p>
        </div>

        {nameState && "error" in nameState && (
          <p className="text-sm text-destructive">{nameState.error}</p>
        )}
        {nameState && "success" in nameState && (
          <p className="text-sm text-muted-foreground">Saved.</p>
        )}

        <button
          type="submit"
          disabled={namePending}
          className="rounded-full bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          {namePending ? "Saving…" : "Save"}
        </button>
      </form>

      {/* Email */}
      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="text-sm text-foreground mt-0.5">{email}</p>
          </div>
          {!showEmailForm && (
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Change
            </button>
          )}
        </div>

        {showEmailForm && (
          <form action={emailAction} className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="new_email"
                className="text-sm text-muted-foreground"
              >
                New email address
              </label>
              <input
                id="new_email"
                name="new_email"
                type="email"
                required
                placeholder="new@example.com"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                A confirmation link will be sent to the new address. Your email
                won&apos;t change until you click it.
              </p>
            </div>

            {emailState && "error" in emailState && (
              <p className="text-sm text-destructive">{emailState.error}</p>
            )}
            {emailState && "success" in emailState && (
              <p className="text-sm text-muted-foreground">
                Confirmation sent. Check your new email inbox.
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={emailPending}
                className="rounded-full bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
              >
                {emailPending ? "Sending…" : "Send confirmation"}
              </button>
              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
