import { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { MobilePayouts } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { openConnectHandoff } from "@/lib/web-handoff";

const STATUS: Record<string, { label: string; tone: string; help: string }> = {
  unset: {
    label: "Not set up",
    tone: "text-shell-dim",
    help: "Set up payouts to collect deposits straight into your own account.",
  },
  pending: {
    label: "Pending review",
    tone: "text-accent",
    help: "Stripe is verifying your details. This can take a little while.",
  },
  active: {
    label: "Active",
    tone: "text-success-fg",
    help: "You're all set to collect deposits.",
  },
  restricted: {
    label: "Action needed",
    tone: "text-danger-fg",
    help: "Stripe needs more information before you can be paid out.",
  },
  disabled: {
    label: "Disabled",
    tone: "text-danger-fg",
    help: "This payout account is disabled. Update your details to re-enable it.",
  },
};

export default function PayoutsScreen() {
  const q = useApiQuery<MobilePayouts>("/settings/payouts");
  const queryClient = useQueryClient();
  const themed = useColors();
  const [working, setWorking] = useState<null | "link" | "sync">(null);
  const [error, setError] = useState<string | null>(null);

  const payouts = q.data;
  const hasAccount = !!payouts && payouts.status !== "unset";
  const status = payouts ? (STATUS[payouts.status] ?? STATUS.unset) : null;

  // Open the web Connect KYC in an in-app browser via a one-time login link
  // (PII is entered on the web form → Stripe; never through the app). On return,
  // refresh the stored status.
  async function openKyc() {
    setWorking("link");
    setError(null);
    try {
      await openConnectHandoff("/settings/payouts");
      await queryClient.invalidateQueries({
        queryKey: ["api", "/settings/payouts"],
      });
    } catch (e) {
      captureError(e, { op: "openKyc" });
      setError("Couldn't open payout setup. Try again.");
    } finally {
      setWorking(null);
    }
  }

  // Re-fetch the account from Stripe (while it finishes verifying).
  async function syncStatus() {
    setWorking("sync");
    setError(null);
    try {
      const fresh = await apiPost<MobilePayouts>("/settings/payouts");
      queryClient.setQueryData(["api", "/settings/payouts"], fresh);
    } catch (e) {
      captureError(e, { op: "syncPayouts" });
      setError(e instanceof Error ? e.message : "Couldn't refresh. Try again.");
    } finally {
      setWorking(null);
    }
  }

  if (!payouts) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load payouts"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={themed.accent}
          />
        }
      >
        <Card>
          <Text className="text-xs uppercase tracking-widest text-shell-mute">
            Payout status
          </Text>
          <Text className={`mt-1 text-xl font-bold ${status?.tone}`}>
            {status?.label}
          </Text>
          <Text className="mt-2 text-sm text-shell-dim">{status?.help}</Text>

          {hasAccount ? (
            <View className="mt-4 gap-1.5">
              <StatusLine
                label="Accept charges"
                ok={payouts.chargesEnabled}
              />
              <StatusLine label="Payouts" ok={payouts.payoutsEnabled} />
              <StatusLine
                label="In-app card deposits"
                ok={payouts.routeCharges}
              />
              {payouts.country ? (
                <View className="flex-row justify-between">
                  <Text className="text-sm text-shell-dim">Country</Text>
                  <Text className="text-sm text-foreground">{payouts.country}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Card>

        {payouts.stripeMode === "test" ? (
          <View className="mt-4 rounded-2xl border border-mustard/40 bg-mustard/10 px-3 py-2.5">
            <Text className="text-sm text-foreground">
              Deposits are in test mode in this environment. No real charges
              will be made.
            </Text>
          </View>
        ) : null}

        {error ? (
          <Text className="mt-4 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <View className="mt-5 gap-3">
          <Button
            label={hasAccount ? "Update payout details" : "Set up payouts"}
            onPress={openKyc}
            loading={working === "link"}
            disabled={working !== null}
          />
          {hasAccount ? (
            <Button
              label="Refresh status"
              variant="secondary"
              onPress={syncStatus}
              loading={working === "sync"}
              disabled={working !== null}
            />
          ) : null}
        </View>

        <Text className="mt-5 text-xs leading-relaxed text-shell-mute">
          Payout setup is handled securely by Stripe in your browser. Inklee never
          stores your ID or bank details.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function StatusLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-shell-dim">{label}</Text>
      <Text className={`text-sm font-medium ${ok ? "text-success-fg" : "text-shell-dim"}`}>
        {ok ? "Enabled" : "Not yet"}
      </Text>
    </View>
  );
}
