import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";
import {
  FORFEIT_PCT_OPTIONS,
  depositPolicyLines,
  isDraftDefaultPolicy,
  policyWindowMax,
  type DepositPolicy,
  type ForfeitPct,
  type TimeUnit,
} from "@inklee/shared/deposit-policy";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Segmented } from "@/components/Segmented";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { config } from "@/lib/config";
import { colors } from "@/lib/tokens";
import { useColors } from "@/lib/theme";

// Cancellation & refunds — the structured deposit policy editor (web parity:
// bookings/deposits DepositPolicyForm). The shape is platform-constrained:
// refund window + late-cancel forfeit % + optional last-minute 100% window;
// never free text. The preview lines come from the shared depositPolicyLines()
// so the client-facing copy cannot drift from web or from the snapshot frozen
// onto each booking at payment time.
const BASE = config.apiUrl;

const UNIT_OPTIONS: readonly { value: TimeUnit; label: string }[] = [
  { value: "days", label: "Days" },
  { value: "hours", label: "Hours" },
];

const FORFEIT_OPTIONS = FORFEIT_PCT_OPTIONS.map((pct) => ({
  value: String(pct),
  label: `${pct}%`,
}));

// In-app browser for the legal references (same pattern as the payouts KYC
// hand-off); swallow rejections so a tap never throws unhandled.
const openLegal = (url: string) => {
  void WebBrowser.openBrowserAsync(url).catch(() => {});
};

// Mirrors the web action's window validation (0..365 days / 0..720 hours).
function validateWindow(
  raw: string,
  unit: TimeUnit,
): { value: number } | { error: string } {
  const max = policyWindowMax(unit);
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(value) || value < 0 || value > max) {
    return { error: `Each window must be between 0 and ${max} ${unit}.` };
  }
  return { value };
}

export default function DepositPolicyScreen() {
  const q = useApiQuery<DepositPolicy>("/settings/deposit-policy");
  const themed = useColors();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load your deposit policy"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <PolicyForm initial={q.data} />;
}

function PolicyForm({ initial }: { initial: DepositPolicy }) {
  const queryClient = useQueryClient();

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview policy from the current form state (mirrors web).
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

  async function save() {
    Keyboard.dismiss();
    setSaved(false);

    const refund = validateWindow(refundValue, refundUnit);
    if ("error" in refund) {
      setError(refund.error);
      return;
    }
    let lastMinute: { value: number; unit: TimeUnit } | null = null;
    if (lastMinuteOn) {
      const lm = validateWindow(lastMinuteValue, lastMinuteUnit);
      if ("error" in lm) {
        setError(lm.error);
        return;
      }
      lastMinute = { value: lm.value, unit: lastMinuteUnit };
    }

    setSaving(true);
    setError(null);
    try {
      await apiPost("/settings/deposit-policy", {
        refundWindow: { value: refund.value, unit: refundUnit },
        lateCancelForfeitPct: forfeit,
        lastMinute,
      });
      await queryClient.invalidateQueries({
        queryKey: ["api", "/settings/deposit-policy"],
      });
      setSaved(true);
    } catch (e) {
      captureError(e, { op: "saveDepositPolicy" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
      >
        <Text className="mb-4 text-sm text-shell-dim">
          Your deposit policy is shown to clients before they pay, and it&apos;s
          locked to each booking at payment time.
        </Text>

        {isDraftDefaultPolicy(preview) ? (
          <View className="mb-4 rounded-2xl border border-mustard/40 bg-mustard/10 px-3 py-2.5">
            <Text className="text-sm text-foreground">
              These are conservative starting values. Adjust each field below to
              match how you work with deposits.
            </Text>
          </View>
        ) : null}

        <TextField
          label="Refund window (before the appointment)"
          value={refundValue}
          onChangeText={(v) => setRefundValue(v.replace(/[^0-9]/g, ""))}
          placeholder="7"
          keyboardType="number-pad"
          hint="Cancel within this window and the client gets a full refund."
        />
        <Segmented
          options={UNIT_OPTIONS}
          value={refundUnit}
          onChange={setRefundUnit}
        />

        <Text className="mb-1.5 text-sm font-medium text-foreground">
          Kept if the client cancels later
        </Text>
        <Segmented
          options={FORFEIT_OPTIONS}
          value={String(forfeit)}
          onChange={(v) => setForfeit(Number.parseInt(v, 10) as ForfeitPct)}
        />

        <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass p-4">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-foreground">
              Last-minute window
            </Text>
            <Text className="mt-0.5 text-sm text-shell-dim">
              Keep the full deposit when the client cancels at the last minute.
            </Text>
          </View>
          <Switch
            value={lastMinuteOn}
            onValueChange={setLastMinuteOn}
            trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
            thumbColor={colors.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        </View>

        {lastMinuteOn ? (
          <>
            <TextField
              label="Last-minute window (before the appointment)"
              value={lastMinuteValue}
              onChangeText={(v) =>
                setLastMinuteValue(v.replace(/[^0-9]/g, ""))
              }
              placeholder="24"
              keyboardType="number-pad"
            />
            <Segmented
              options={UNIT_OPTIONS}
              value={lastMinuteUnit}
              onChange={setLastMinuteUnit}
            />
          </>
        ) : null}

        <View className="mb-3 rounded-2xl border border-shell-border bg-glass px-4 py-3">
          <Text className="text-sm text-shell-dim">
            If you cancel, the client always gets a full refund. This is set by
            Inklee and can&apos;t be turned off.
          </Text>
        </View>

        <View className="mb-4 rounded-2xl border border-shell-border p-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-shell-mute">
            Preview as the client sees it
          </Text>
          <View className="mt-2 gap-1">
            {depositPolicyLines(preview).map((line, i) => (
              <Text key={i} className="text-sm leading-relaxed text-foreground">
                {line}
              </Text>
            ))}
          </View>
        </View>

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}
        {saved && !error ? (
          <Text className="mb-3 text-sm text-shell-dim">Saved.</Text>
        ) : null}

        <Button label="Save deposit policy" onPress={save} loading={saving} />

        <Text className="mt-5 text-xs leading-relaxed text-shell-mute">
          The structure is set by Inklee&apos;s platform policy and can&apos;t
          be replaced with free text. See{" "}
          <Text
            className="underline text-shell-dim"
            onPress={() => openLegal(`${BASE}/terms`)}
          >
            Terms section 12
          </Text>{" "}
          and the{" "}
          <Text
            className="underline text-shell-dim"
            onPress={() => openLegal(`${BASE}/dpa`)}
          >
            DPA
          </Text>
          .
        </Text>
      </ScrollView>
    </Screen>
  );
}
