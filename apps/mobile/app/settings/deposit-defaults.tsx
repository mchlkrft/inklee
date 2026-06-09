import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Text,
  View,
} from "react-native";
import { TextArea } from "@/components/TextArea";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { DepositDefaults } from "@inklee/shared/deposit-settings";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";

const NOTE_MAX = 300;

export default function DepositDefaultsScreen() {
  const q = useApiQuery<DepositDefaults>("/settings/deposit-defaults");

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <ErrorState
              title="Couldn't load deposit defaults"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <DepositForm initial={q.data} />;
}

function DepositForm({ initial }: { initial: DepositDefaults }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState(
    initial.amount != null ? String(initial.amount) : "",
  );
  const [dueDays, setDueDays] = useState(String(initial.due_days));
  const [note, setNote] = useState(initial.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    Keyboard.dismiss();

    // Amount is optional. Accept EU formatting (German is the default market): a
    // comma is the decimal separator; dots/spaces are thousands separators.
    let amountValue: number | null = null;
    let amountRaw = amount.trim().replace(/\s/g, "");
    if (amountRaw.includes(",")) {
      amountRaw = amountRaw.replace(/\./g, "").replace(",", ".");
    }
    if (amountRaw !== "") {
      const n = Number(amountRaw);
      if (!Number.isFinite(n) || n < 0) {
        setError("Default amount must be a positive number, or leave it empty.");
        return;
      }
      amountValue = n;
    }

    const days = parseInt(dueDays.trim(), 10);
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      setError("Due window must be between 1 and 90 days.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiPost("/settings/deposit-defaults", {
        amount: amountValue,
        dueDays: days,
        note: note.trim(),
      });
      await queryClient.invalidateQueries({
        queryKey: ["api", "/settings/deposit-defaults"],
      });
      router.back();
    } catch (e) {
      captureError(e, { op: "saveDepositDefaults" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
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
          These pre-fill the deposit request you send per booking. You can still
          change them for each request.
        </Text>

        <TextField
          label="Default amount (EUR, optional)"
          value={amount}
          onChangeText={setAmount}
          placeholder="e.g. 50"
          keyboardType="decimal-pad"
          hint="Leave empty to enter an amount each time."
        />
        <TextField
          label="Due within (days)"
          value={dueDays}
          onChangeText={(v) => setDueDays(v.replace(/[^0-9]/g, ""))}
          placeholder="7"
          keyboardType="number-pad"
        />

        <Text className="mb-1.5 text-sm font-medium text-bone">
          Note to client (optional)
        </Text>
        <TextArea
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX}
          placeholder="Shown in the deposit request email"
          showCounter
        />

        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
        ) : null}

        <Button label="Save" onPress={save} loading={saving} />
      </ScrollView>
    </Screen>
  );
}
