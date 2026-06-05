"use client";

import { useActionState, useState } from "react";
import { saveDepositDefaultsAction } from "./actions";
import type { DepositDefaults } from "@/lib/deposit-settings";

type State = { error: string } | { success: true } | null;

export default function DepositsForm({
  defaults,
}: {
  defaults: DepositDefaults;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveDepositDefaultsAction,
    null,
  );

  const [amount, setAmount] = useState<string>(
    defaults.amount !== null ? String(defaults.amount) : "",
  );
  const [dueDays, setDueDays] = useState<string>(String(defaults.due_days));
  const [note, setNote] = useState<string>(defaults.note);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="amount" className="text-sm font-medium text-foreground">
          Default amount{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (optional)
          </span>
        </label>
        <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
          <span className="mr-1 select-none text-muted-foreground">EUR</span>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 200"
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Pre-fills the deposit amount when you request one. Leave empty to
          enter it fresh for every request.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="due_days"
          className="text-sm font-medium text-foreground"
        >
          Due within
        </label>
        <div className="flex items-center gap-2">
          <input
            id="due_days"
            name="due_days"
            type="number"
            min="1"
            max="90"
            inputMode="numeric"
            value={dueDays}
            onChange={(e) => setDueDays(e.target.value)}
            className="w-24 rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">days</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Sets the default due date when you request a deposit, counted from the
          day you send the request.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="note" className="text-sm font-medium text-foreground">
          Default note to the client{" "}
          <span className="text-xs font-normal text-muted-foreground">
            (optional)
          </span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Bank transfer details, what the deposit covers, refund policy."
          className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Included in the deposit email to your client. You can edit it per
          request.
        </p>
      </div>

      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state && "success" in state && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save defaults"}
      </button>
    </form>
  );
}
