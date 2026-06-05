"use client";

import { useActionState, useState } from "react";
import { saveDepositPolicyAction } from "./actions";
import {
  FORFEIT_PCT_OPTIONS,
  depositPolicyLines,
  isDraftDefaultPolicy,
  type DepositPolicy,
  type ForfeitPct,
  type TimeUnit,
} from "@/lib/deposit-policy";

type State = { error: string } | { success: true } | null;

function UnitSelect({
  name,
  value,
  onChange,
}: {
  name: string;
  value: TimeUnit;
  onChange: (u: TimeUnit) => void;
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value as TimeUnit)}
      className="rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="days">days</option>
      <option value="hours">hours</option>
    </select>
  );
}

export default function DepositPolicyForm({
  policy: initial,
}: {
  policy: DepositPolicy;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveDepositPolicyAction,
    null,
  );

  const [refundValue, setRefundValue] = useState(
    String(initial.refundWindow.value),
  );
  const [refundUnit, setRefundUnit] = useState<TimeUnit>(
    initial.refundWindow.unit,
  );
  const [forfeit, setForfeit] = useState<ForfeitPct>(
    initial.lateCancelForfeitPct,
  );
  const [lastMinuteOn, setLastMinuteOn] = useState(initial.lastMinute !== null);
  const [lastMinuteValue, setLastMinuteValue] = useState(
    String(initial.lastMinute?.value ?? 24),
  );
  const [lastMinuteUnit, setLastMinuteUnit] = useState<TimeUnit>(
    initial.lastMinute?.unit ?? "hours",
  );

  // Live preview policy from the current form state.
  const preview: DepositPolicy = {
    refundWindow: {
      value: Number.parseInt(refundValue || "0", 10) || 0,
      unit: refundUnit,
    },
    lateCancelForfeitPct: forfeit,
    lastMinute: lastMinuteOn
      ? {
          value: Number.parseInt(lastMinuteValue || "0", 10) || 0,
          unit: lastMinuteUnit,
        }
      : null,
  };

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Refund window
        </label>
        <div className="flex items-center gap-2">
          <input
            name="refund_window_value"
            type="number"
            min="0"
            inputMode="numeric"
            value={refundValue}
            onChange={(e) => setRefundValue(e.target.value)}
            className="w-24 rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <UnitSelect
            name="refund_window_unit"
            value={refundUnit}
            onChange={setRefundUnit}
          />
          <span className="text-sm text-muted-foreground">
            before the appointment
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Cancel within this window and the client gets a full refund.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Kept if the client cancels later
        </label>
        <div className="flex gap-2">
          {FORFEIT_PCT_OPTIONS.map((pct) => (
            <label
              key={pct}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground has-[:checked]:border-foreground has-[:checked]:text-foreground"
            >
              <input
                type="radio"
                name="forfeit_pct"
                value={pct}
                checked={forfeit === pct}
                onChange={() => setForfeit(pct)}
                className="accent-brand-mustard"
              />
              {pct}%
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            name="last_minute_enabled"
            checked={lastMinuteOn}
            onChange={(e) => setLastMinuteOn(e.target.checked)}
            className="accent-brand-mustard"
          />
          Add a last-minute window where the full deposit is kept
        </label>
        {lastMinuteOn && (
          <div className="flex items-center gap-2 pl-6">
            <input
              name="last_minute_value"
              type="number"
              min="0"
              inputMode="numeric"
              value={lastMinuteValue}
              onChange={(e) => setLastMinuteValue(e.target.value)}
              className="w-24 rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <UnitSelect
              name="last_minute_unit"
              value={lastMinuteUnit}
              onChange={setLastMinuteUnit}
            />
            <span className="text-sm text-muted-foreground">
              before the appointment
            </span>
          </div>
        )}
      </div>

      {/* Reciprocity is platform-enforced, shown so the artist knows it. */}
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          If <span className="font-medium text-foreground">you</span> cancel,
          the client always gets a full refund. This is set by Inklee and
          can&apos;t be turned off.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preview as the client sees it
        </p>
        <ul className="space-y-1 text-sm text-foreground">
          {depositPolicyLines(preview).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      {isDraftDefaultPolicy(preview) && (
        <p className="rounded-md border border-orange-400/40 bg-orange-400/[0.07] px-3 py-2 text-xs text-orange-400">
          These are conservative starting values. Adjust each field below to
          match how you work with deposits.
        </p>
      )}

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
        {pending ? "Saving…" : "Save deposit policy"}
      </button>
    </form>
  );
}
