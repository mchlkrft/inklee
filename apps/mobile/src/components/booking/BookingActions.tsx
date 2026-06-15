import { type ReactNode, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { invalidateBookingViews, useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { captureError } from "@/lib/telemetry";
import { track, type AnalyticsEvent } from "@/lib/analytics";
import {
  approveBooking,
  canRefundDeposit,
  cancelBooking,
  formatMoney,
  markDepositReceived,
  refundDeposit,
  rejectBooking,
  requestDeposit,
  type BookingDetail,
} from "@/lib/bookings";
import {
  DEPOSIT_DEFAULTS_FALLBACK,
  type DepositDefaults,
} from "@inklee/shared/deposit-settings";
import {
  PLATFORM_FEE_PERCENT,
  artistNetEur,
  platformFeeEur,
} from "@inklee/shared/platform-fee";
import {
  addDaysToDateKey,
  isDateKey,
  localDateKey,
} from "@inklee/shared/date-utils";
import { isTerminal } from "@inklee/shared/booking-fsm";
import { artistDepositCurrency } from "@inklee/shared/connect-countries";
import type { MobilePayouts } from "@inklee/shared/mobile-api";

// Status-gated actions for a booking, mirroring the web status-actions.tsx for
// the paths the mobile API exposes. After any mutation we invalidate the booking
// views (detail + inbox + Home counts + calendar + client history) so every
// screen re-gates on the new status — not just this one.
//
// Deferred vs web (documented E2 follow-ups): the goods pending-interest accept
// popup (goods commerce is parked) and the guest-spot studio-confirm popup —
// the detail endpoint surfaces neither, so accept fires directly here.
export function BookingActions({ booking }: { booking: BookingDetail }) {
  const queryClient = useQueryClient();
  const invalidate = () => invalidateBookingViews(queryClient);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDepositForm, setShowDepositForm] = useState(false);

  // Runs a non-destructive action (Accept / Mark received) with a busy spinner.
  async function run(key: string, fn: () => Promise<unknown>) {
    setPending(key);
    setError(null);
    try {
      await fn();
      const ev: Record<string, AnalyticsEvent> = {
        accept: "booking_accepted",
        mark: "deposit_marked_received",
      };
      if (ev[key]) track(ev[key]);
      void invalidate();
    } catch (e) {
      captureError(e, { op: "bookingAction", action: key });
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  const status = booking.status;
  const isPending = status === "pending";
  const isDepositPending = status === "deposit_pending";
  const isApproved = status === "approved";
  const busy = pending !== null;

  // Terminal-state check from the shared FSM (the server's source of truth)
  // rather than a local string compare, so the gating can't drift from it.
  if (isTerminal(status)) return null;

  // A paid, not-yet-refunded card deposit: refundable in-app, and an artist
  // cancel will auto-refund it. Web only ever surfaces refund alongside the
  // approved/cancel surface (a paid card deposit auto-confirms to approved), so
  // we keep the refund button inside the approved branch.
  const refundable = canRefundDeposit(booking);

  return (
    <View className="gap-3">
      {error ? <Text className="text-sm text-danger-fg">{error}</Text> : null}

      {isPending ? (
        <>
          <Action
            hint="Sends the client an acceptance email with a link to confirm details."
          >
            <Button
              label="Accept"
              loading={pending === "accept"}
              disabled={busy}
              onPress={() => run("accept", () => approveBooking(booking.id))}
            />
          </Action>

          {showDepositForm ? (
            <DepositRequestForm
              booking={booking}
              onDone={() => {
                setShowDepositForm(false);
                void invalidate();
              }}
              onCancel={() => setShowDepositForm(false)}
            />
          ) : (
            <Action hint="Marks the booking as awaiting deposit. The client gets a payment link by email (or pays you directly if you're not connected).">
              <Button
                label="Request deposit"
                variant="secondary"
                disabled={busy}
                onPress={() => setShowDepositForm(true)}
              />
            </Action>
          )}

          <ConfirmAction
            trigger="Pass"
            title="Pass on this request?"
            body="Sends the client a polite decline by email."
            confirmLabel="Yes, pass"
            onConfirm={() => rejectBooking(booking.id).then(invalidate)}
            event="booking_rejected"
          />
        </>
      ) : null}

      {isDepositPending ? (
        <>
          {booking.deposit?.hasCardIntent && !booking.deposit.paid ? (
            <View className="gap-2">
              <View className="rounded-xl border border-shell-border bg-glass px-4 py-3">
                <Text className="text-sm font-medium text-foreground">
                  Waiting for card payment
                </Text>
                <Text className="mt-1 text-xs text-shell-dim">
                  The client pays by card via the link in their email. The
                  booking confirms automatically when the deposit lands, and
                  you&apos;ll be notified.
                </Text>
              </View>
              <Action hint="Confirms the booking and cancels the card request so the client isn't charged twice.">
                <Button
                  label="Mark received manually"
                  variant="secondary"
                  loading={pending === "mark"}
                  disabled={busy}
                  onPress={() =>
                    run("mark", () => markDepositReceived(booking.id))
                  }
                />
              </Action>
            </View>
          ) : (
            <Action hint="Marks the deposit as paid and confirms the booking.">
              <Button
                label="Mark deposit received"
                loading={pending === "mark"}
                disabled={busy}
                onPress={() =>
                  run("mark", () => markDepositReceived(booking.id))
                }
              />
            </Action>
          )}

          <ConfirmAction
            trigger="Pass"
            title="Pass on this request?"
            body="Sends the client a polite decline by email."
            confirmLabel="Yes, pass"
            onConfirm={() => rejectBooking(booking.id).then(invalidate)}
            event="booking_rejected"
          />
        </>
      ) : null}

      {isApproved ? (
        <>
          {refundable ? (
            <ConfirmAction
              trigger="Refund deposit"
              title={`Refund ${
                booking.deposit
                  ? formatMoney(
                      booking.deposit.amount,
                      booking.deposit.currency,
                    )
                  : "the deposit"
              } to the client?`}
              body="The full deposit is returned. Inklee returns its platform fee; Stripe's card-processing fee stays on your account."
              confirmLabel="Yes, refund"
              onConfirm={() => refundDeposit(booking.id).then(invalidate)}
              event="deposit_refunded"
            />
          ) : null}

          <ConfirmAction
            trigger="Cancel booking"
            title="Cancel this booking?"
            body={
              refundable && booking.deposit
                ? `The client's ${formatMoney(
                    booking.deposit.amount,
                    booking.deposit.currency,
                  )} deposit is refunded in full (Inklee returns its fee; Stripe's processing fee stays on your account). The client is notified.`
                : "The slot is reopened and the client is notified."
            }
            confirmLabel="Yes, cancel booking"
            onConfirm={() => cancelBooking(booking.id).then(invalidate)}
            event="booking_cancelled"
          />
        </>
      ) : null}
    </View>
  );
}

// A primary/secondary action with an explanatory hint beneath it.
function Action({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <View className="gap-1">
      {children}
      <Text className="text-xs text-shell-dim">{hint}</Text>
    </View>
  );
}

// Two-step destructive confirm (Pass / Cancel / Refund). onConfirm is expected
// to perform the mutation AND trigger the parent refetch; on success this
// subtree typically unmounts as the status changes, so we only handle errors.
function ConfirmAction({
  trigger,
  title,
  body,
  confirmLabel,
  onConfirm,
  event,
}: {
  trigger: string;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  event?: AnalyticsEvent;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <View className="gap-1">
        <Button
          label={trigger}
          variant="secondary"
          size="sm"
          onPress={() => setOpen(true)}
        />
        {error ? <Text className="text-xs text-danger-fg">{error}</Text> : null}
      </View>
    );
  }

  return (
    <View className="gap-2 rounded-xl border border-danger/50 p-3">
      <Text className="text-sm text-foreground">{title}</Text>
      {body ? <Text className="text-xs text-shell-dim">{body}</Text> : null}
      {error ? <Text className="text-xs text-danger-fg">{error}</Text> : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label={confirmLabel}
            variant="danger"
            size="sm"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                if (event) track(event);
                // Reset on success too: a refund keeps the booking approved (it
                // doesn't go terminal), so this subtree stays mounted and would
                // otherwise be stuck spinning. Cancel/reject unmount us, where
                // these setters are harmless no-ops.
                setBusy(false);
                setOpen(false);
              } catch (e) {
                captureError(e, { op: "bookingConfirm", action: trigger });
                setError(e instanceof Error ? e.message : "Action failed.");
                setBusy(false);
              }
            }}
          />
        </View>
        {/* Content-width on purpose: the confirm label ("Yes, cancel booking")
            needs the row's spare width or it shrinks on small screens. */}
        <Button
          label="Keep it"
          variant="secondary"
          size="sm"
          disabled={busy}
          onPress={() => {
            setOpen(false);
            setError(null);
          }}
        />
      </View>
    </View>
  );
}

// Inline deposit-request form. Lazy-mounted (only when the artist taps "Request
// deposit") so its two prefill fetches don't run on every detail open. Prefills
// from the artist's deposit defaults and shows the 3% fee split for in-app
// (Connect) deposits, mirroring the web form.
function DepositRequestForm({
  booking,
  onDone,
  onCancel,
}: {
  booking: BookingDetail;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const colors = useColors();
  const defaults = useApiQuery<DepositDefaults>("/settings/deposit-defaults");
  const payouts = useApiQuery<MobilePayouts>("/settings/payouts");

  // routeCharges is the SERVER's card-routing gate (active status AND charges
  // enabled, via deriveConnectRouting) — the loose chargesEnabled flag can be
  // true for a restricted account the server would refuse to route, which
  // would show card copy + a fee split for a deposit that lands as manual.
  const canCollectInApp = !!payouts.data?.routeCharges;
  const currency =
    booking.deposit?.currency ?? artistDepositCurrency(payouts.data?.country);

  const [amount, setAmount] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Prefill once the defaults fetch settles (a single time, so later edits
  // aren't clobbered by a refresh). Falls back to sane defaults if the fetch
  // errored, so the due date is never left empty.
  useEffect(() => {
    if (!prefilled && !defaults.loading) {
      const d = defaults.data ?? DEPOSIT_DEFAULTS_FALLBACK;
      setAmount(d.amount !== null ? String(d.amount) : "");
      setDueAt(addDaysToDateKey(localDateKey(), d.due_days));
      setNote(d.note);
      setPrefilled(true);
    }
  }, [prefilled, defaults.loading, defaults.data]);

  // Don't assert card-vs-manual (or show the fee) until the payouts fetch
  // settles, otherwise a Connect-active artist briefly sees the "manual" copy.
  const payoutsReady = !payouts.loading;
  // German keyboards emit a comma decimal separator; normalize before parsing
  // so "200,50" isn't silently truncated to 200.
  const parsedAmount = parseFloat(amount.replace(",", "."));
  const showFee =
    payoutsReady &&
    canCollectInApp &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;

  async function submit() {
    const value = parseFloat(amount.replace(",", "."));
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError("Enter a valid deposit amount.");
      return;
    }
    if (!isDateKey(dueAt)) {
      setError("Enter a valid due date (YYYY-MM-DD).");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await requestDeposit(booking.id, value, dueAt, note.trim() || null);
      track("deposit_requested");
      onDone();
    } catch (e) {
      captureError(e, { op: "requestDeposit" });
      setError(e instanceof Error ? e.message : "Could not request deposit.");
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-3 rounded-xl border border-shell-border p-4">
      <Text className="text-sm font-medium text-foreground">Request deposit</Text>

      {!payoutsReady ? (
        <Text className="text-xs text-shell-dim">
          Checking your payout setup…
        </Text>
      ) : canCollectInApp ? (
        <Text className="text-xs text-shell-dim">
          The client pays by card via a link in their email.
        </Text>
      ) : (
        <Text className="text-xs text-shell-dim">
          You&apos;ll collect this deposit directly (e.g. bank transfer, add
          details in the note) and mark it received.{" "}
          <Text
            className="font-medium text-accent"
            onPress={() => router.push("/settings/payouts")}
          >
            Connect Stripe in Settings
          </Text>{" "}
          to take card payments in-app.
        </Text>
      )}

      <View className="gap-1">
        <Text className="text-xs text-shell-dim">Amount *</Text>
        <View className="h-12 flex-row items-center rounded-xl border border-shell-border px-3">
          <Text className="mr-1 text-shell-dim">{currency.toUpperCase()}</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="200"
            placeholderTextColor={colors.shell.mute}
            keyboardType="decimal-pad"
            className="flex-1 text-foreground"
          />
        </View>
        {showFee ? (
          <Text className="text-xs text-shell-dim">
            Inklee fee ({PLATFORM_FEE_PERCENT}%): −
            {formatMoney(platformFeeEur(parsedAmount), currency)} · You receive{" "}
            {formatMoney(artistNetEur(parsedAmount), currency)}
          </Text>
        ) : null}
      </View>

      <View className="gap-1">
        <Text className="text-xs text-shell-dim">Due by * (YYYY-MM-DD)</Text>
        <TextInput
          value={dueAt}
          onChangeText={setDueAt}
          placeholder="2026-06-30"
          placeholderTextColor={colors.shell.mute}
          autoCapitalize="none"
          className="h-12 rounded-xl border border-shell-border px-3 text-foreground"
        />
      </View>

      <View className="gap-1">
        <Text className="text-xs text-shell-dim">Note to client (optional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="e.g. bank transfer details or payment method"
          placeholderTextColor={colors.shell.mute}
          maxLength={300}
          className="h-12 rounded-xl border border-shell-border px-3 text-foreground"
        />
      </View>

      {error ? <Text className="text-xs text-danger-fg">{error}</Text> : null}

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label="Send request"
            loading={submitting}
            disabled={submitting}
            onPress={submit}
          />
        </View>
        <Button
          label="Cancel"
          variant="secondary"
          disabled={submitting}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}
