"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Spinner from "@/components/spinner";
import {
  DISCOUNT_CODE_MAX,
  discountLabel,
  type DiscountKind,
} from "@inklee/shared/discounts";
import { saveDiscountAction, setDiscountActiveAction } from "./actions";

type State = { error: string } | { success: true } | null;

export type DiscountRow = {
  id: string;
  code: string;
  kind: DiscountKind;
  value: number;
  min_subtotal_minor: number;
  max_redemptions: number | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  /** Redemptions counted from the redemptions table, which IS the cap. */
  used: number;
};

const FIELD =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

const eur = (minor: number) => `€${(minor / 100).toFixed(2)}`;

function DiscountForm({
  entitled,
  existing,
  onDone,
}: {
  entitled: boolean;
  /** Set when editing. Without this the save core's edit path existed but was
   *  unreachable: an artist could create a code and switch it off, but never
   *  fix a typo in the amount or extend an end date. */
  existing?: DiscountRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    saveDiscountAction,
    null,
  );
  const [kind, setKind] = useState<DiscountKind>(existing?.kind ?? "percent");

  // In an effect, not during render: calling onDone() while rendering sets
  // state on the parent mid-render, which React warns about and which can
  // drop the update.
  useEffect(() => {
    if (state && "success" in state) onDone();
  }, [state, onDone]);

  return (
    <form
      action={action}
      className="space-y-4 rounded-md border border-border p-5"
    >
      {!entitled && (
        <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
          Discount codes are part of Plus.
        </p>
      )}
      {state && "error" in state && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="code" className="text-xs text-muted-foreground">
          Code
        </label>
        <input
          id="code"
          name="code"
          required
          maxLength={DISCOUNT_CODE_MAX}
          defaultValue={existing?.code ?? ""}
          placeholder="SUMMER25"
          // Rendered uppercase by the class and normalized on save. Mutating
          // e.target.value in onChange would fight React's value tracking on
          // an uncontrolled input for no visible gain.
          className={`${FIELD} font-mono uppercase`}
        />
        <p className="text-xs text-muted-foreground">
          Letters and numbers only. Case does not matter to your clients.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="kind" className="text-xs text-muted-foreground">
            Type
          </label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as DiscountKind)}
            className={FIELD}
          >
            <option value="percent">Percentage off</option>
            <option value="fixed">Fixed amount off</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="value" className="text-xs text-muted-foreground">
            {kind === "percent" ? "Percent" : "Amount in euros"}
          </label>
          <input
            id="value"
            name="value"
            type="number"
            min={kind === "percent" ? 1 : 0.5}
            max={kind === "percent" ? 100 : undefined}
            step={kind === "percent" ? 1 : 0.5}
            defaultValue={existing ? existing.value / 100 : ""}
            required
            className={FIELD}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="minSubtotal"
            className="text-xs text-muted-foreground"
          >
            Minimum order (optional)
          </label>
          <input
            id="minSubtotal"
            name="minSubtotal"
            type="number"
            min={0}
            step={1}
            defaultValue={
              existing && existing.min_subtotal_minor > 0
                ? existing.min_subtotal_minor / 100
                : ""
            }
            placeholder="0"
            className={FIELD}
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="maxRedemptions"
            className="text-xs text-muted-foreground"
          >
            Total uses (optional)
          </label>
          <input
            id="maxRedemptions"
            name="maxRedemptions"
            type="number"
            min={1}
            step={1}
            defaultValue={existing?.max_redemptions ?? ""}
            placeholder="Unlimited"
            className={FIELD}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="startsAt" className="text-xs text-muted-foreground">
            Starts (optional)
          </label>
          <input
            id="startsAt"
            name="startsAt"
            type="date"
            defaultValue={existing?.starts_at?.slice(0, 10) ?? ""}
            className={FIELD}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="endsAt" className="text-xs text-muted-foreground">
            Ends (optional)
          </label>
          <input
            id="endsAt"
            name="endsAt"
            type="date"
            defaultValue={existing?.ends_at?.slice(0, 10) ?? ""}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !entitled}
          className="rounded-full bg-brand-mustard px-5 py-1.5 text-xs font-medium text-brand-charcoal disabled:opacity-50"
        >
          {pending ? (
            <Spinner className="w-4 h-4 mx-auto" />
          ) : existing ? (
            "Save changes"
          ) : (
            "Create code"
          )}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function DiscountList({
  codes,
  entitled,
}: {
  codes: DiscountRow[];
  entitled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {codes.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          No codes yet. A code applies to the goods in an order, never to the
          deposit.
        </p>
      )}

      <ul className="space-y-2">
        {codes.map((c) =>
          editingId === c.id ? (
            <li key={c.id}>
              <DiscountForm
                entitled={entitled}
                existing={c}
                onDone={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li
              key={c.id}
              className={`rounded-md border border-border px-4 py-3 ${
                c.active ? "" : "opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-foreground">
                  {c.code}
                </span>
                <span className="text-xs text-muted-foreground">
                  {discountLabel(c, eur)}
                </span>
                {!c.active && (
                  <span className="rounded border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
                    Off
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.max_redemptions
                  ? `${c.used} of ${c.max_redemptions} used`
                  : `${c.used} used`}
                {c.min_subtotal_minor > 0 &&
                  ` · minimum ${eur(c.min_subtotal_minor)}`}
                {c.ends_at &&
                  ` · ends ${new Date(c.ends_at).toLocaleDateString("en-GB")}`}
              </p>
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingId(c.id)}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await setDiscountActiveAction(c.id, !c.active);
                    })
                  }
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {c.active ? "Switch off" : "Switch on"}
                </button>
              </div>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <DiscountForm entitled={entitled} onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          + New code
        </button>
      )}
    </div>
  );
}
