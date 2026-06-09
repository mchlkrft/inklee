import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { BooksSettings } from "@inklee/shared/books-settings";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPut } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";

const CLOSED_MESSAGE_MAX = 280;

export default function BookingSettings() {
  const q = useApiQuery<BooksSettings>("/settings/books");

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <ErrorState
              title="Couldn't load booking settings"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <BooksForm initial={q.data} />;
}

function BooksForm({ initial }: { initial: BooksSettings }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(initial.books_open);
  const [cap, setCap] = useState(
    initial.booking_cap != null ? String(initial.booking_cap) : "",
  );
  const [closedMessage, setClosedMessage] = useState(
    initial.books_closed_message ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    Keyboard.dismiss();
    let bookingCap: number | null = null;
    if (cap.trim() !== "") {
      const n = Number(cap.trim());
      if (!Number.isFinite(n) || n <= 0) {
        setError("Limit must be a positive number, or leave it empty.");
        return;
      }
      bookingCap = Math.round(n);
    }

    setSaving(true);
    setError(null);
    try {
      // bookingWindowEndsAt is intentionally omitted → preserved server-side
      // (the booking-window auto-close is a web-only setting).
      await apiPut("/settings/books", {
        open,
        bookingCap,
        booksClosedMessage: closedMessage.trim() || null,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["api", "/settings/books"] }),
        queryClient.invalidateQueries({ queryKey: ["api", "/home"] }),
      ]);
      router.back();
    } catch (e) {
      captureError(e, { op: "saveBooks" });
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
        <View className="mb-4 flex-row items-center justify-between rounded-2xl border border-shell-border bg-[rgba(229,225,213,0.04)] p-4">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-bone">
              {open ? "Open for requests" : "Closed"}
            </Text>
            <Text className="mt-0.5 text-sm text-shell-dim">
              {open
                ? "Clients can send new requests."
                : "Your page shows a closed notice."}
            </Text>
          </View>
          <Switch
            value={open}
            onValueChange={setOpen}
            trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
            thumbColor={colors.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        </View>

        <TextField
          label="Limit new requests (optional)"
          value={cap}
          onChangeText={(v) => setCap(v.replace(/[^0-9]/g, ""))}
          placeholder="No limit"
          keyboardType="number-pad"
          hint="Pause requests after this many are open."
        />

        {!open ? (
          <>
            <Text className="mb-1.5 text-sm font-medium text-bone">
              Closed message (optional)
            </Text>
            <View className="rounded-xl border border-shell-border px-4 py-3">
              <TextInput
                value={closedMessage}
                onChangeText={setClosedMessage}
                multiline
                maxLength={CLOSED_MESSAGE_MAX}
                placeholder="Books reopen in July"
                placeholderTextColor={colors.shell.mute}
                className="min-h-[64px] text-base text-bone"
                style={{ textAlignVertical: "top" }}
              />
            </View>
            <Text className="mb-3 mt-1 text-right text-xs text-shell-mute">
              {closedMessage.length}/{CLOSED_MESSAGE_MAX}
            </Text>
          </>
        ) : null}

        {error ? (
          <Text className="mb-3 mt-2 text-sm text-danger">{error}</Text>
        ) : null}

        <View className="mt-2">
          <Button label="Save" onPress={save} loading={saving} />
        </View>
      </ScrollView>
    </Screen>
  );
}
