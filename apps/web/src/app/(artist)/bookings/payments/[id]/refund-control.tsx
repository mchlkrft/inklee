"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refundPaymentRequestAction } from "../actions";
import type { PaymentRequestLineView } from "@/lib/server/appointment-payment-read";

const INPUT =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type Mode = "full" | "by_line" | "custom";

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

// Refund control on the request detail (FD12: by-line + quantity + custom
// amount, replacing the earlier full-refund-only control). The engine
// (refundPaymentRequestCore) already computed and enforces every amount; this
// component only chooses WHICH shape of refund and a permitted case, and
// shows a buyer-facing confirmation copy before submitting because a refund
// moves money and cannot be undone from here.
export function RefundControl({
  requestId,
  lines,
  currency,
}: {
  requestId: string;
  lines: PaymentRequestLineView[];
  currency: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<Mode>("full");
  const [selectedLines, setSelectedLines] = useState<Record<string, boolean>>(
    {},
  );
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [customAmount, setCustomAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    refundedMinor: number;
    remainingRefundableMinor: number;
    retainedProcessorCostMinor: number;
  } | null>(null);

  // A line already fully refunded has nothing left to select.
  const refundableLines = lines.filter((l) => l.refundStatus !== "full");

  function summary(): string {
    if (mode === "full")
      return "Return the full remaining amount to the client.";
    if (mode === "custom") {
      const n = Number.parseFloat(customAmount || "0");
      return Number.isFinite(n) && n > 0
        ? `Return ${n.toFixed(2)} ${currency.toUpperCase()} to the client.`
        : "Enter an amount to refund.";
    }
    const count = Object.values(selectedLines).filter(Boolean).length;
    return count === 0
      ? "Select at least one line to refund."
      : `Return ${count} selected line${count === 1 ? "" : "s"} to the client.`;
  }

  function submit() {
    setError(null);
    if (mode === "custom") {
      const minor = Math.round(Number.parseFloat(customAmount || "0") * 100);
      if (!Number.isFinite(minor) || minor <= 0) {
        setError("Enter a positive amount.");
        return;
      }
      startTransition(async () => {
        finish(
          await refundPaymentRequestAction({
            id: requestId,
            refundType: "partial",
            amountMinor: minor,
            case: "voluntary_partial",
          }),
        );
      });
      return;
    }
    if (mode === "by_line") {
      const lineIds = Object.keys(selectedLines).filter(
        (id) => selectedLines[id],
      );
      if (lineIds.length === 0) {
        setError("Select at least one line.");
        return;
      }
      const lineQuantities: Record<string, number> = {};
      for (const id of lineIds) {
        const raw = quantities[id];
        const n = raw ? Number.parseInt(raw, 10) : NaN;
        if (Number.isFinite(n) && n > 0) lineQuantities[id] = n;
      }
      startTransition(async () => {
        finish(
          await refundPaymentRequestAction({
            id: requestId,
            refundType: "by_line",
            lineIds,
            lineQuantities:
              Object.keys(lineQuantities).length > 0
                ? lineQuantities
                : undefined,
            case: "voluntary_full",
          }),
        );
      });
      return;
    }
    startTransition(async () => {
      finish(
        await refundPaymentRequestAction({
          id: requestId,
          refundType: "full",
          case: "voluntary_full",
        }),
      );
    });
  }

  function finish(r: Awaited<ReturnType<typeof refundPaymentRequestAction>>) {
    setConfirming(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setResult({
      refundedMinor: r.refundedMinor,
      remainingRefundableMinor: r.remainingRefundableMinor,
      retainedProcessorCostMinor: r.retainedProcessorCostMinor,
    });
    setExpanded(false);
    router.refresh();
  }

  if (result) {
    return (
      <div className="space-y-1 rounded-md border border-border px-3 py-2 text-sm text-foreground">
        <p>
          Refunded {formatMinor(result.refundedMinor, currency)}.{" "}
          {result.remainingRefundableMinor > 0
            ? `${formatMinor(result.remainingRefundableMinor, currency)} still refundable.`
            : "Nothing further is refundable on this request."}
        </p>
        {/* A6 (accountant, 2026-08-02): a SEPARATE line, never folded into the
            sentence above — the retained cost is not part of what moved back
            to the client, it is what Inklee did not return of its own fee. */}
        {result.retainedProcessorCostMinor > 0 && (
          <p className="text-muted-foreground">
            Retained processing cost:{" "}
            {formatMinor(result.retainedProcessorCostMinor, currency)} of
            Inklee&apos;s fee, kept to cover a non-recoverable card-processing
            cost on this refund.
          </p>
        )}
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Refund
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-[14px] border border-border p-3">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { value: "full", label: "Full refund" },
            { value: "by_line", label: "By line" },
            { value: "custom", label: "Custom amount" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              mode === opt.value
                ? "border-foreground text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === "by_line" && (
        <div className="space-y-2">
          {refundableLines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every line has already been fully refunded.
            </p>
          ) : (
            refundableLines.map((line) => (
              <label
                key={line.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-2 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={Boolean(selectedLines[line.id])}
                  onChange={() =>
                    setSelectedLines((prev) => ({
                      ...prev,
                      [line.id]: !prev[line.id],
                    }))
                  }
                />
                <span className="flex-1 truncate text-foreground">
                  {line.name}
                  {line.quantity > 1 ? ` (qty ${line.quantity})` : ""}
                  {line.refundStatus === "partial"
                    ? " · partially refunded"
                    : ""}
                </span>
                <span className="text-muted-foreground">
                  {formatMinor(line.lineTotalMinor, currency)}
                </span>
                {line.quantity > 1 && selectedLines[line.id] && (
                  <input
                    value={quantities[line.id] ?? ""}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [line.id]: e.target.value,
                      }))
                    }
                    placeholder={`qty (max ${line.quantity})`}
                    inputMode="numeric"
                    aria-label={`Quantity to refund for ${line.name}`}
                    className={`${INPUT} max-w-[9rem]`}
                  />
                )}
              </label>
            ))
          )}
        </div>
      )}

      {mode === "custom" && (
        <input
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder={`0.00 ${currency.toUpperCase()}`}
          inputMode="decimal"
          aria-label="Amount to refund"
          className={`${INPUT} max-w-[10rem]`}
        />
      )}

      <p className="text-sm text-muted-foreground">{summary()}</p>

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            This cannot be undone. Confirm the refund above?
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/[0.06] disabled:opacity-60"
          >
            {pending ? "Refunding..." : "Confirm refund"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="text-xs text-muted-foreground underline disabled:opacity-60"
          >
            Keep it
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/30"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-muted-foreground underline"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
