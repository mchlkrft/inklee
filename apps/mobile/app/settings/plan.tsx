import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/ErrorState";
import { ApiError, apiPost, invalidateByPathPrefix, useApiQuery } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import type {
  MobileBillingCancelResult,
  MobileBillingSubscription,
  MobileBillingWithdrawResult,
  MobileMe,
} from "@inklee/shared/mobile-api";
import { PLUS_BENEFITS } from "@inklee/shared/plus-benefits";

// Read-only plan display PLUS the statutory management functions. Billing is
// web-only (no in-app purchase, no prices, no upgrade CTA — IAP compliance,
// decision D17), but the EU consumer-law functions on an EXISTING subscription
// are post-purchase management, not purchases, so they live here too:
// - the 14-day right of withdrawal (Art. 11a), separate from cancelling;
// - ordinary cancellation (keeps Plus until the end of the paid period).
// The copy mirrors the counsel-approved web strings verbatim.

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}

export default function PlanScreen() {
  useScreenView("settings_plan");
  const colors = useColors();
  const queryClient = useQueryClient();
  const q = useApiQuery<MobileMe>("/me");
  const me = q.data;
  const isPlus = me?.plan === "plus";
  const sub = useApiQuery<MobileBillingSubscription>("/billing/subscription", {
    enabled: isPlus === true,
  });

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // Local mirrors so the card reflects a completed action immediately, before
  // the invalidated queries land: a finished withdrawal removes the whole card
  // (the subscription is gone), a scheduled cancellation flips the cancel half
  // to its "already set to end" note while the WITHDRAWAL stays available (a
  // cancellation never extinguishes a still-valid withdrawal right).
  const [withdrawDone, setWithdrawDone] = useState(false);
  const [cancelScheduled, setCancelScheduled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) {
    return (
      <Screen edges={["left", "right"]}>
        {q.loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ErrorState
            title="Couldn't load your plan"
            subtitle={q.error ?? undefined}
            onRetry={q.refresh}
          />
        )}
      </Screen>
    );
  }

  // A grandfathered artist who already keeps template editing shouldn't be
  // sold it back as an upgrade reason (mirrors the web plan page).
  const benefits =
    !isPlus && me.grandfathered && me.keepsTemplates
      ? PLUS_BENEFITS.filter((b) => !b.includes("email templates"))
      : PLUS_BENEFITS;

  const afterBillingChange = () => {
    invalidateByPathPrefix(queryClient, ["/me", "/billing", "/home"]);
  };

  const runWithdraw = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const r = await apiPost<MobileBillingWithdrawResult>(
        "/billing/withdraw",
        { confirmed: true },
      );
      if (r.status === "completed") {
        const refundLine =
          r.refundMinor > 0
            ? ` A refund of ${(r.refundMinor / 100).toFixed(2)} ${r.currency.toUpperCase()} is on its way to your original payment method.`
            : "";
        setDone(
          `Your withdrawal is confirmed. Your subscription has ended and your account and data are kept.${refundLine}`,
        );
        setWithdrawDone(true);
        afterBillingChange();
      } else if (r.status === "not_available") {
        setError(r.reason);
      } else {
        setError("You have no active paid subscription to withdraw from.");
      }
      setWithdrawOpen(false);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Something went wrong processing your withdrawal. Please try again, or write to support@inklee.app.",
      );
    } finally {
      setPending(false);
    }
  };

  const runCancel = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const r = await apiPost<MobileBillingCancelResult>("/billing/cancel", {
        confirmed: true,
      });
      if (r.status === "scheduled" || r.status === "already_scheduled") {
        const endLine = r.effectiveAt
          ? ` You keep Plus until ${fmtDate(r.effectiveAt)}.`
          : " You keep Plus until the end of the current paid period.";
        setDone(
          r.status === "scheduled"
            ? `Your cancellation is confirmed.${endLine} Your account and data are kept.`
            : `Your subscription is already set to end.${endLine}`,
        );
        setCancelScheduled(true);
        afterBillingChange();
      } else {
        setError("You have no active paid subscription to cancel.");
      }
      setCancelOpen(false);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Something went wrong cancelling your subscription. Please try again, or write to support@inklee.app.",
      );
    } finally {
      setPending(false);
    }
  };

  const withdrawal = sub.data?.withdrawal;
  const deadlineLabel = withdrawal?.deadline
    ? fmtDate(withdrawal.deadline)
    : null;

  return (
    <Screen edges={["left", "right"]} column="form">
      <View className="flex-1 pt-3">
        <Card>
          <Text className="text-sm text-shell-dim">Current plan</Text>
          <Text className="mt-1 text-2xl font-semibold text-foreground">
            {isPlus ? "Plus" : "Free"}
          </Text>
          {!isPlus && me.grandfathered ? (
            <Text className="mt-3 text-sm text-shell-dim">
              You&apos;re on Free with early-artist benefits.
              {me.keepsTemplates
                ? " You keep custom email templates from before Plus launched."
                : ""}
            </Text>
          ) : null}
          {isPlus && sub.data?.hasActiveSubscription ? (
            <Text className="mt-3 text-sm text-shell-dim">
              {sub.data.cancelAtPeriodEnd || cancelScheduled
                ? sub.data.currentPeriodEnd
                  ? `Your subscription is set to end on ${fmtDate(sub.data.currentPeriodEnd)}. You keep Plus until then.`
                  : "Your subscription is set to end at the close of the current paid period. You keep Plus until then."
                : sub.data.currentPeriodEnd
                  ? `Renews on ${fmtDate(sub.data.currentPeriodEnd)}.`
                  : ""}
            </Text>
          ) : null}
        </Card>

        <Text className="mb-2 mt-6 text-sm font-medium text-foreground">
          {isPlus ? "Your Plus benefits" : "What Plus includes"}
        </Text>
        <Card>
          {benefits.map((b, i) => (
            <View
              key={b}
              className={`flex-row items-start gap-2 py-2.5 ${
                i > 0 ? "border-t border-shell-border" : ""
              }`}
            >
              <Text className="text-base text-accent">{"✓"}</Text>
              <Text className="flex-1 text-sm text-foreground">{b}</Text>
            </View>
          ))}
        </Card>

        {done ? (
          <Text className="mt-5 text-sm text-shell-dim">{done}</Text>
        ) : null}
        {error ? <Text className="mt-5 text-sm text-danger-fg">{error}</Text> : null}

        {/* Subscription management: statutory functions on an EXISTING
            subscription (no purchase surface). The card stays for as long as
            the subscription exists: a scheduled cancellation only collapses
            the cancel half into its confirmation note, while the Art. 11a
            withdrawal below stays continuously available (mirrors the web,
            where WithdrawButton renders regardless of cancel scheduling). */}
        {isPlus && sub.data?.hasActiveSubscription && !withdrawDone ? (
          <View className="mt-6">
            <Text className="mb-2 text-sm font-medium text-foreground">
              Subscription
            </Text>
            <Card>
              {/* Ordinary cancellation, distinct from withdrawal. */}
              {sub.data.cancelAtPeriodEnd || cancelScheduled ? (
                <Text className="text-sm text-shell-dim">
                  {sub.data.currentPeriodEnd
                    ? `Your subscription is set to end on ${fmtDate(sub.data.currentPeriodEnd)}. You keep Plus until then.`
                    : "Your subscription is set to end at the close of the current paid period. You keep Plus until then."}
                </Text>
              ) : cancelOpen ? (
                <View className="gap-2">
                  <Text className="text-sm font-medium text-foreground">
                    Cancel your subscription
                  </Text>
                  <Text className="text-sm text-shell-dim">
                    {sub.data.currentPeriodEnd
                      ? `Your Inklee Plus subscription will end on ${fmtDate(sub.data.currentPeriodEnd)}. You keep Plus until then, and there is no refund for the current period. Your account and all of your data are kept.`
                      : "Your Inklee Plus subscription will end at the close of the current paid period. You keep Plus until then, and there is no refund for the current period. Your account and all of your data are kept."}
                  </Text>
                  <View className="flex-row items-center gap-3">
                    <Pressable
                      disabled={pending}
                      onPress={runCancel}
                      className="rounded-full border border-shell-border px-4 py-2.5 active:opacity-70"
                    >
                      <Text className="text-sm font-semibold text-foreground">
                        {pending ? "Cancelling…" : "Cancel now"}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={pending}
                      onPress={() => setCancelOpen(false)}
                    >
                      <Text className="text-sm text-shell-dim underline">
                        Keep my subscription
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    setWithdrawOpen(false);
                    setCancelOpen(true);
                  }}
                  className="py-1 active:opacity-70"
                >
                  <Text className="text-sm text-foreground">
                    Cancel your subscription here
                  </Text>
                  {/* The E4 step-1 explainer, verbatim from the web section. */}
                  <Text className="mt-0.5 text-xs text-shell-dim">
                    Cancelling ends your Inklee Plus subscription at the end of
                    the current paid period. You keep Plus until then, and your
                    account and all of your data are kept.
                  </Text>
                </Pressable>
              )}

              <View className="my-3 border-t border-shell-border" />

              {/* Statutory withdrawal (Art. 11a), separate from cancelling. */}
              {withdrawOpen ? (
                <View className="gap-2">
                  <Text className="text-sm font-medium text-foreground">
                    Withdraw from your contract
                  </Text>
                  <Text className="text-sm text-shell-dim">
                    This is your 14-day right of withdrawal, which is different
                    from cancelling. Withdrawing ends your Inklee Plus
                    subscription now and refunds the part of the current period
                    you have not used, or the full amount if you did not ask us
                    to start immediately. Cancelling instead keeps your access
                    until the end of the paid period. Either way you keep your
                    account and all of your data. You do not need to give a
                    reason or contact us.
                  </Text>
                  {deadlineLabel ? (
                    <Text className="text-sm text-shell-dim">
                      {withdrawal?.withinWindow
                        ? `Your 14-day withdrawal period ends on ${deadlineLabel}.`
                        : `Your 14-day withdrawal period ended on ${deadlineLabel}.`}
                    </Text>
                  ) : null}
                  <View className="flex-row items-center gap-3">
                    <Pressable
                      disabled={pending}
                      onPress={runWithdraw}
                      className="rounded-full border border-shell-border px-4 py-2.5 active:opacity-70"
                    >
                      <Text className="text-sm font-semibold text-foreground">
                        {pending ? "Processing…" : "Yes, withdraw from my contract"}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={pending}
                      onPress={() => setWithdrawOpen(false)}
                    >
                      <Text className="text-sm text-shell-dim underline">
                        Never mind
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    setCancelOpen(false);
                    setWithdrawOpen(true);
                  }}
                  className="py-1 active:opacity-70"
                >
                  <Text className="text-sm text-foreground">
                    Withdraw from contract here
                  </Text>
                  <Text className="mt-0.5 text-xs text-shell-dim">
                    {deadlineLabel && withdrawal?.withinWindow
                      ? `Bought Inklee Plus recently? You can withdraw until ${deadlineLabel}, which is separate from cancelling.`
                      : "Bought Inklee Plus in the last 14 days? You have a right to withdraw, which is separate from cancelling."}
                  </Text>
                </Pressable>
              )}
            </Card>
          </View>
        ) : null}

        <Text className="mt-5 text-xs text-shell-dim">
          Your plan and billing are managed on the web.
        </Text>
      </View>
    </Screen>
  );
}
