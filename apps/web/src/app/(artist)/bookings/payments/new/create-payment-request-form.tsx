"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { createPaymentRequestAction } from "../actions";
import type { SubjectOption } from "./page";

const INPUT =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type LineDraft = {
  name: string;
  amount: string; // major units, e.g. "50.00"
  classification: "tattoo_service" | "additional_service";
};

const COLLECTS = [
  { value: "deposit", label: "Deposit" },
  { value: "balance", label: "Remaining balance" },
  { value: "full_price", label: "Full price" },
];

function toMinor(amount: string): number | null {
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function CreatePaymentRequestForm({
  subjectOptions,
}: {
  subjectOptions: SubjectOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState(subjectOptions[0]?.value ?? "");
  const [collects, setCollects] = useState("deposit");
  const [lines, setLines] = useState<LineDraft[]>([
    { name: "", amount: "", classification: "tattoo_service" },
  ]);

  const patchLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { name: "", amount: "", classification: "tattoo_service" },
    ]);
  const removeLine = (i: number) =>
    setLines((prev) =>
      prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev,
    );

  const submit = () => {
    setError(null);

    const [kind, id] = subject.split(":");
    if ((kind !== "booking" && kind !== "project") || !id) {
      setError("Choose the appointment or project this payment is for.");
      return;
    }

    const built: {
      name: string;
      unitAmountMinor: number;
      quantity: number;
      classification: string;
    }[] = [];
    for (const l of lines) {
      const name = l.name.trim();
      const minor = toMinor(l.amount);
      if (!name || minor === null || minor <= 0) {
        setError("Give every line a name and a positive amount.");
        return;
      }
      built.push({
        name,
        unitAmountMinor: minor,
        quantity: 1,
        classification: l.classification,
      });
    }

    startTransition(async () => {
      const result = await createPaymentRequestAction({
        subject: { kind, id },
        collects,
        currency: "eur",
        lines: built,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/bookings/payments/${result.id}`);
    });
  };

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-foreground">For</span>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Appointment or project"
          className={INPUT}
        >
          {subjectOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-foreground">Collecting</span>
        <select
          value={collects}
          onChange={(e) => setCollects(e.target.value)}
          aria-label="What this collects"
          className={INPUT}
        >
          {COLLECTS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <span className="text-sm font-medium text-foreground">Line items</span>
        {lines.map((l, i) => (
          <div
            key={i}
            className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 px-2 py-2"
          >
            <input
              value={l.name}
              onChange={(e) => patchLine(i, { name: e.target.value })}
              placeholder="Description (e.g. Deposit)"
              className={`${INPUT} flex-1`}
            />
            <input
              value={l.amount}
              onChange={(e) => patchLine(i, { amount: e.target.value })}
              placeholder="0.00"
              inputMode="decimal"
              aria-label="Amount in EUR"
              className={`${INPUT} max-w-[7rem]`}
            />
            <select
              value={l.classification}
              onChange={(e) =>
                patchLine(i, {
                  classification:
                    e.target.value === "additional_service"
                      ? "additional_service"
                      : "tattoo_service",
                })
              }
              aria-label="Line type"
              className={`${INPUT} max-w-[11rem]`}
            >
              <option value="tattoo_service">Tattoo service</option>
              <option value="additional_service">Additional service</option>
            </select>
            <button
              type="button"
              onClick={() => removeLine(i)}
              disabled={lines.length === 1}
              aria-label="Remove line"
              className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add line
        </button>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="inline-flex items-center justify-center rounded-lg bg-brand-mustard px-5 py-2.5 text-sm font-semibold text-brand-charcoal transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create draft"}
      </button>
    </div>
  );
}
