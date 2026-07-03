"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import DateInput from "@/components/date-input";
import { addDaysToDateKey, localDateKey } from "@/lib/date-utils";
import { useOptimistic, useState, useTransition } from "react";
import {
  approveBooking,
  approveBookingWithInterestDecisions,
  applyInterestDecisions,
  rejectBooking,
  requestDeposit,
  markDepositReceived,
  reopenBooking,
} from "../../actions";
import type { InterestDecisionPayload } from "@/lib/booking-interests";
import {
  DEPOSIT_DEFAULTS_FALLBACK,
  type DepositDefaults,
  type StripeMode,
} from "@/lib/deposit-settings";
import {
  PLATFORM_FEE_PERCENT,
  platformFeeEur,
  artistNetEur,
} from "@/lib/platform-fee";
import { formatPrice } from "@/lib/goods";

type Booking = {
  id: string;
  status: string;
};

function tomorrow(): string {
  return addDaysToDateKey(localDateKey(), 1);
}

type PendingInterest = {
  id: string;
  title: string;
  variant: string | null;
  quantity: number;
  // Product thumbnail (image_urls[0] ?? image_url, may be null). Renders as a
  // small square next to the title in the popup so the artist visually
  // recognises which item the client picked.
  imageUrl: string | null;
};

export default function StatusActions({
  booking,
  depositDefaults = DEPOSIT_DEFAULTS_FALLBACK,
  stripeMode = "missing",
  canCollectInApp = true,
  hasDepositIntent = false,
  confirmStudio = null,
  pendingInterests = [],
  currency = "eur",
  canReopen = false,
}: {
  booking: Booking;
  depositDefaults?: DepositDefaults;
  stripeMode?: StripeMode;
  // RS-2: true when the artist has an active Stripe Connect account, so the
  // client can pay the deposit by card in-app. When false, requesting a
  // deposit creates a MANUAL deposit — the client pays the artist directly
  // and the artist marks it received (no money flows through Inklee).
  canCollectInApp?: boolean;
  // RS-6/F7: true when THIS booking's deposit is a live in-app card intent
  // (set at request time). Distinct from canCollectInApp, which reflects the
  // artist's CURRENT Connect state. Drives the deposit_pending UI: an in-app
  // deposit waits for the card payment (auto-confirmed by the webhook) and
  // demotes the manual "mark received" to an explicit override.
  hasDepositIntent?: boolean;
  // Set when the booking is tied to a trip — accepting then asks the artist to
  // confirm the studio/location (which the approval email tells the client).
  confirmStudio?: { name: string; dateLabel: string | null } | null;
  // Goods the client marked at submit time, still awaiting the artist's
  // availability decision. Drives the Accept confirmation popup; empty array
  // means accept fires immediately (subject to the studio check above).
  pendingInterests?: PendingInterest[];
  // The artist's deposit currency (Slice 79d) — what amounts in the deposit
  // request form + fee preview are denominated in.
  currency?: string;
  // True when this booking is cancelled/passed AND no deposit money was kept, so
  // the artist can reopen it back to pending and restart the loop. The server
  // re-checks the money condition before reopening.
  canReopen?: boolean;
}) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(booking.status);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showDepositForm, setShowDepositForm] = useState(false);
  // Pre-fill from per-artist defaults (configured at /settings/deposits).
  const [depositAmount, setDepositAmount] = useState(
    depositDefaults.amount !== null ? String(depositDefaults.amount) : "",
  );
  const [depositDueAt, setDepositDueAt] = useState(
    addDaysToDateKey(localDateKey(), depositDefaults.due_days),
  );
  const [depositNote, setDepositNote] = useState(depositDefaults.note);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  // Confirmation popup that fires whenever the booking has a guest-spot
  // studio AND/OR pending goods interests. `pendingAction` carries which
  // button triggered it so the popup's confirm step can branch:
  //   • "accept" → approve immediately (with or without interest decisions).
  //   • "deposit" → apply decisions only, then open the deposit form.
  // null means the popup is closed.
  const [pendingAction, setPendingAction] = useState<
    null | "accept" | "deposit"
  >(null);
  // Per-interest availability decisions, default = available for every row so
  // a "Yes, accept" click without any tweaking marks them all as available.
  const [decisions, setDecisions] = useState<
    Record<string, { available: boolean; note: string }>
  >(() =>
    Object.fromEntries(
      pendingInterests.map((i) => [i.id, { available: true, note: "" }]),
    ),
  );

  const needsAcceptPopup = !!confirmStudio || pendingInterests.length > 0;

  function buildDecisionsPayload(): InterestDecisionPayload[] {
    return pendingInterests.map((i) => {
      const d = decisions[i.id] ?? { available: true, note: "" };
      return {
        interestId: i.id,
        available: d.available,
        declineNote: d.available ? null : d.note.trim() || null,
      };
    });
  }

  async function handlePopupConfirm() {
    const action = pendingAction;
    setPendingAction(null);
    if (action === "accept") {
      if (pendingInterests.length === 0) {
        run(approveBooking, "approved");
        return;
      }
      const payload = buildDecisionsPayload();
      setError(null);
      startTransition(async () => {
        setOptimisticStatus("approved");
        const result = await approveBookingWithInterestDecisions(
          booking.id,
          payload,
        );
        if ("error" in result) {
          setOptimisticStatus(booking.status);
          setError(result.error);
        }
      });
      return;
    }
    if (action === "deposit") {
      // Persist the goods decisions first (when any) so they're locked in
      // before the client ever pays; then open the inline deposit form so
      // the artist fills amount + due-date as usual.
      if (pendingInterests.length === 0) {
        setShowDepositForm(true);
        return;
      }
      const payload = buildDecisionsPayload();
      setError(null);
      startTransition(async () => {
        const result = await applyInterestDecisions(booking.id, payload);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setShowDepositForm(true);
      });
    }
  }

  const run = async (
    action: (id: string) => Promise<{ error: string } | { success: true }>,
    nextStatus: string,
  ) => {
    setError(null);
    startTransition(async () => {
      setOptimisticStatus(nextStatus);
      const result = await action(booking.id);
      if ("error" in result) {
        setOptimisticStatus(booking.status);
        setError(result.error);
      }
    });
  };

  const handleRequestDeposit = () => {
    const amount = parseFloat(depositAmount);
    if (!depositAmount || isNaN(amount) || amount <= 0) {
      setError("Enter a valid deposit amount");
      return;
    }
    if (!depositDueAt) {
      setError("Enter a due date");
      return;
    }
    setError(null);
    setShowDepositForm(false);
    startTransition(async () => {
      setOptimisticStatus("deposit_pending");
      const result = await requestDeposit(
        booking.id,
        amount,
        depositDueAt,
        depositNote.trim() || null,
      );
      if ("error" in result) {
        setOptimisticStatus(booking.status);
        setError(result.error);
      }
    });
  };

  const isDone = ["approved", "rejected", "cancelled"].includes(
    optimisticStatus,
  );
  const isDepositPending = optimisticStatus === "deposit_pending";
  // A dead booking the artist can revive: cancelled/passed AND no money kept.
  // Reopening returns it to pending, where the full action set (Accept / Request
  // deposit / Pass) comes back so the loop can continue.
  const showReopen =
    canReopen &&
    (optimisticStatus === "cancelled" || optimisticStatus === "rejected");

  // RS-4: the platform fee only applies to in-app (Connect-routed) deposits.
  // Manual deposits go straight to the artist and carry no Inklee fee, so the
  // breakdown is hidden for them.
  const parsedDepositAmount = parseFloat(depositAmount);
  const showFeeBreakdown =
    canCollectInApp &&
    Number.isFinite(parsedDepositAmount) &&
    parsedDepositAmount > 0;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {pendingAction && (
        <div
          onClick={() => setPendingAction(null)}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-[20px] border border-border bg-background p-5 sm:max-w-lg"
          >
            <p className="text-sm font-semibold text-foreground">
              {pendingAction === "deposit"
                ? "Confirm before requesting deposit"
                : "Confirm acceptance"}
            </p>

            {confirmStudio && (
              <div className="space-y-1.5 rounded-md border border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Studio
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  The client will be told to come to{" "}
                  <span className="font-medium text-foreground">
                    {confirmStudio.name}
                  </span>
                  {confirmStudio.dateLabel
                    ? ` on ${confirmStudio.dateLabel}`
                    : ""}
                  .
                </p>
              </div>
            )}

            {pendingInterests.length > 0 && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Goods they&apos;re interested in
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Confirm what&apos;s available. The client decides whether to
                    add each one at checkout. Uncheck anything you can&apos;t do
                    and leave a quick note.
                  </p>
                </div>
                <ul className="space-y-2">
                  {pendingInterests.map((i) => {
                    const d = decisions[i.id] ?? {
                      available: true,
                      note: "",
                    };
                    return (
                      <li key={i.id} className="space-y-1.5">
                        <label className="flex items-start gap-2.5 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={d.available}
                            onChange={(e) =>
                              setDecisions((prev) => ({
                                ...prev,
                                [i.id]: {
                                  available: e.target.checked,
                                  note: prev[i.id]?.note ?? "",
                                },
                              }))
                            }
                            className="mt-1 accent-brand-mustard"
                          />
                          {i.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={i.imageUrl}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 shrink-0 rounded-md bg-muted/40" />
                          )}
                          <span className="flex-1 leading-snug">
                            {i.title}
                            {i.variant ? (
                              <span className="text-muted-foreground">
                                {" "}
                                · {i.variant}
                              </span>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              · qty {i.quantity}
                            </span>
                          </span>
                        </label>
                        {!d.available && (
                          <textarea
                            value={d.note}
                            onChange={(e) =>
                              setDecisions((prev) => ({
                                ...prev,
                                [i.id]: {
                                  available: false,
                                  note: e.target.value,
                                },
                              }))
                            }
                            rows={2}
                            maxLength={300}
                            placeholder="Quick note: sold out, only in blue, swap suggestion…"
                            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handlePopupConfirm}
                className="flex-1 rounded-full bg-brand-mustard px-4 py-2.5 text-sm font-semibold text-brand-charcoal"
              >
                {pendingAction === "deposit"
                  ? "Continue to deposit"
                  : "Yes, accept"}
              </button>
              <button
                onClick={() => setPendingAction(null)}
                className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isDepositPending && (
        <div className="flex flex-col gap-3">
          {hasDepositIntent ? (
            // F7: in-app card deposit — the webhook confirms it automatically.
            // The manual mark is demoted to an override (and cancels the card
            // request server-side so the client isn't charged twice).
            <>
              <div className="space-y-1 rounded-md border border-border bg-muted/20 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  Waiting for card payment
                </p>
                <p className="text-xs text-muted-foreground">
                  The client pays by card via the link in their email. The
                  booking confirms automatically when the deposit lands, and
                  you&apos;ll be notified.
                </p>
              </div>
              <details className="rounded-md border border-border px-3 py-2">
                <summary className="cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                  Client paying another way?
                </summary>
                <div className="mt-2 space-y-1">
                  <button
                    onClick={() => run(markDepositReceived, "approved")}
                    className="w-full rounded-full border border-border px-5 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
                  >
                    Mark received manually
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Confirms the booking and cancels the card request so the
                    client isn&apos;t charged twice.
                  </p>
                </div>
              </details>
            </>
          ) : (
            <div className="space-y-1">
              <button
                onClick={() => run(markDepositReceived, "approved")}
                className="w-full rounded-full bg-brand-mustard px-5 py-3 text-base font-semibold text-brand-charcoal"
              >
                Mark deposit received
              </button>
              <p className="text-xs text-muted-foreground">
                Marks the deposit as paid and confirms the booking.
              </p>
            </div>
          )}

          {!confirmReject ? (
            <div className="space-y-1">
              <button
                onClick={() => setConfirmReject(true)}
                className="w-full rounded-full border border-border px-5 py-2 text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
              >
                Pass
              </button>
              <p className="text-xs text-muted-foreground">
                Sends the client a polite decline by email.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-destructive/50 p-3 space-y-2">
              <p className="text-sm text-foreground">Pass on this request?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    run(rejectBooking, "rejected");
                    setConfirmReject(false);
                  }}
                  className="rounded-full bg-destructive px-4 py-1.5 text-xs font-medium text-white"
                >
                  Yes, pass
                </button>
                <button
                  onClick={() => setConfirmReject(false)}
                  className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!isDone && !isDepositPending && (
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <button
              onClick={() =>
                needsAcceptPopup
                  ? setPendingAction("accept")
                  : run(approveBooking, "approved")
              }
              className="w-full rounded-full bg-brand-mustard px-5 py-3 text-base font-semibold text-brand-charcoal"
            >
              Accept
            </button>
            <p className="text-xs text-muted-foreground">
              Sends the client an acceptance email with a link to confirm
              details.
            </p>
          </div>

          {!showDepositForm ? (
            <div className="space-y-1">
              <button
                onClick={() =>
                  needsAcceptPopup
                    ? setPendingAction("deposit")
                    : setShowDepositForm(true)
                }
                className="w-full rounded-full border border-border px-5 py-2 text-sm text-foreground hover:bg-muted/30 transition-colors"
              >
                Request deposit
              </button>
              <p className="text-xs text-muted-foreground">
                {canCollectInApp
                  ? "Marks the booking as awaiting deposit. The client pays by card via the link in their booking email."
                  : "Marks the booking as awaiting deposit. The client pays you directly (add your details in the note) and you mark it received."}
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-border p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">
                Request deposit
              </p>
              {!canCollectInApp && (
                // RS-2: artist has no active Stripe Connect account → this is a
                // manual deposit. Set expectations + nudge toward connecting.
                <div className="space-y-1 rounded-md border border-border bg-muted/20 px-3 py-2">
                  <p className="text-xs leading-snug text-muted-foreground">
                    You&apos;ll collect this deposit{" "}
                    <span className="font-medium text-foreground">
                      directly
                    </span>{" "}
                    (e.g. bank transfer; put your details in the note) and mark
                    it received. No card payment is taken in-app.
                  </p>
                  <p className="text-xs leading-snug text-muted-foreground">
                    Want clients to pay by card here?{" "}
                    <Link
                      href="/settings/payouts"
                      className="font-medium text-foreground underline underline-offset-2"
                    >
                      Connect Stripe
                    </Link>
                    .
                  </p>
                </div>
              )}
              {canCollectInApp && stripeMode === "test" && (
                // Yellow test-mode banner — warns the artist this request
                // will NOT process a real payment. Only fires when
                // pk_test_* keys are configured (dev/preview).
                <div className="flex items-start gap-2 rounded-md border border-brand-mustard/50 bg-brand-mustard/15 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-mustard" />
                  <p className="text-xs leading-snug text-foreground">
                    Stripe is in test mode, so no real payment will be taken.
                    Live keys aren’t configured in this environment.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Amount *
                  </label>
                  <div className="flex items-center rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
                    <span className="text-muted-foreground select-none mr-1">
                      {currency.toUpperCase()}
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="200"
                      className="flex-1 bg-transparent text-foreground focus:outline-none"
                    />
                  </div>
                  {showFeeBreakdown && (
                    <p className="text-xs text-muted-foreground">
                      Processing fee ({PLATFORM_FEE_PERCENT}%): −
                      {formatPrice(
                        platformFeeEur(parsedDepositAmount),
                        currency,
                      )}{" "}
                      · You receive{" "}
                      {formatPrice(artistNetEur(parsedDepositAmount), currency)}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Due by *
                  </label>
                  <DateInput
                    value={depositDueAt}
                    min={tomorrow()}
                    onChange={(e) => setDepositDueAt(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Note to customer{" "}
                    <span className="text-muted-foreground/60">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={depositNote}
                    onChange={(e) => setDepositNote(e.target.value)}
                    placeholder="e.g. Bank transfer details or payment method"
                    maxLength={300}
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleRequestDeposit}
                  className="flex-1 rounded-full bg-brand-mustard px-4 py-1.5 text-xs font-medium text-brand-charcoal"
                >
                  Send deposit request
                </button>
                <button
                  onClick={() => {
                    setShowDepositForm(false);
                    setError(null);
                  }}
                  className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!confirmReject ? (
            <div className="space-y-1">
              <button
                onClick={() => setConfirmReject(true)}
                className="w-full rounded-full border border-border px-5 py-2 text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
              >
                Pass
              </button>
              <p className="text-xs text-muted-foreground">
                Sends the client a polite decline by email.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-destructive/50 p-3 space-y-2">
              <p className="text-sm text-foreground">Pass on this request?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    run(rejectBooking, "rejected");
                    setConfirmReject(false);
                  }}
                  className="rounded-full bg-destructive px-4 py-1.5 text-xs font-medium text-white"
                >
                  Yes, pass
                </button>
                <button
                  onClick={() => setConfirmReject(false)}
                  className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showReopen && (
        <div className="flex flex-col gap-3">
          {!confirmReopen ? (
            <div className="space-y-1">
              <button
                onClick={() => setConfirmReopen(true)}
                className="w-full rounded-full border border-border px-5 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/30"
              >
                Reopen booking
              </button>
              <p className="text-xs text-muted-foreground">
                Brings this request back so you can accept it or request a fresh
                deposit. The client keeps their history.
              </p>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm text-foreground">Reopen this booking?</p>
              <p className="text-xs text-muted-foreground">
                It returns to your requests as pending. Any earlier deposit
                request is cleared, so you can send a new one if you still want
                to.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    run(reopenBooking, "pending");
                    setConfirmReopen(false);
                  }}
                  className="rounded-full bg-brand-mustard px-4 py-1.5 text-xs font-semibold text-brand-charcoal"
                >
                  Yes, reopen
                </button>
                <button
                  onClick={() => setConfirmReopen(false)}
                  className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
