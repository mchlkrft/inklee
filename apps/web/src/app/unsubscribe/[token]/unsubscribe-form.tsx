"use client";

import { useState, useTransition } from "react";
import {
  savePreferencesAction,
  unsubscribeAllAction,
  type UnsubResult,
} from "./actions";

export function UnsubscribeForm({
  token,
  initialMarketing,
  initialLifecycle,
}: {
  token: string;
  initialMarketing: boolean;
  initialLifecycle: boolean;
}) {
  const [marketing, setMarketing] = useState(initialMarketing);
  const [lifecycle, setLifecycle] = useState(initialLifecycle);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  function apply(res: UnsubResult, successMsg: string) {
    if ("error" in res) {
      setIsError(true);
      setMessage(res.error);
      return;
    }
    setIsError(false);
    setMarketing(res.marketing);
    setLifecycle(res.lifecycle);
    setMessage(successMsg);
  }

  function save() {
    startTransition(async () => {
      const res = await savePreferencesAction(token, marketing, lifecycle);
      apply(res, "Your email preferences have been saved.");
    });
  }

  function unsubscribeAll() {
    startTransition(async () => {
      const res = await unsubscribeAllAction(token);
      apply(
        res,
        "You've been unsubscribed from all marketing and lifecycle emails.",
      );
    });
  }

  return (
    <div className="space-y-6">
      {message && (
        <p
          className={
            isError ? "text-sm text-destructive" : "text-sm text-foreground"
          }
        >
          {message}
        </p>
      )}

      <div className="space-y-4">
        <label className="flex items-start gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Product &amp; marketing</span>
            <span className="block text-muted-foreground">
              News, tips, and offers about Inklee.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={lifecycle}
            onChange={(e) => setLifecycle(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Tips &amp; onboarding</span>
            <span className="block text-muted-foreground">
              Guidance to help you get set up and get the most out of Inklee.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="w-full rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save preferences"}
        </button>
        <button
          type="button"
          onClick={unsubscribeAll}
          disabled={pending}
          className="w-full rounded-full bg-brand-mustard px-5 py-2 text-sm font-medium text-brand-charcoal disabled:opacity-50"
        >
          Unsubscribe from all
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Account and booking emails (like password resets and booking
        confirmations) are always sent — they are not marketing.
      </p>
    </div>
  );
}
