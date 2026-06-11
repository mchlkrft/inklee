import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { TextArea } from "@/components/TextArea";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { BooksSettings } from "@inklee/shared/books-settings";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, apiPut, invalidateBooksViews } from "@/lib/api";
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
  const [windowEndsAt, setWindowEndsAt] = useState<string | null>(
    initial.booking_window_ends_at,
  );
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror the web availability form: the open/closed switch saves instantly
  // via the open-only POST (cap/window/message untouched), optimistic with a
  // revert on failure. The Save button persists the rest of the form.
  async function toggleOpen(next: boolean) {
    setOpen(next);
    setToggling(true);
    setError(null);
    try {
      await apiPost("/settings/books", { open: next });
      // /me drives the always-mounted top-bar Books pill and /booking-form the
      // Availability card — refresh them with the form + Home or they contradict
      // the change until an unrelated refetch.
      await invalidateBooksViews(queryClient);
    } catch (e) {
      captureError(e, { op: "toggleBooks" });
      setOpen(!next);
      setError("Couldn't update. Try again.");
    } finally {
      setToggling(false);
    }
  }

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
      // null clears the window server-side; a date-key sets the auto-close
      // (normalizeBooksConfig already accepts bookingWindowEndsAt).
      await apiPut("/settings/books", {
        open,
        bookingCap,
        bookingWindowEndsAt: windowEndsAt,
        booksClosedMessage: closedMessage.trim() || null,
      });
      await invalidateBooksViews(queryClient);
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
        <View className="mb-4 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass p-4">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-foreground">
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
            onValueChange={(v) => {
              void toggleOpen(v);
            }}
            disabled={toggling}
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

        <DateField
          label="Close books on (optional)"
          value={windowEndsAt}
          onChange={setWindowEndsAt}
          minimumDate={new Date()}
        />
        <View className="-mt-1 mb-3 flex-row items-center justify-between">
          <Text className="flex-1 pr-3 text-xs text-shell-dim">
            Books auto-close at midnight on this date.
          </Text>
          {windowEndsAt ? (
            <Pressable
              onPress={() => setWindowEndsAt(null)}
              hitSlop={8}
              className="active:opacity-70"
            >
              <Text className="text-xs font-medium text-accent">Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {!open ? (
          <>
            <Text className="mb-1.5 text-sm font-medium text-foreground">
              Closed message (optional)
            </Text>
            <TextArea
              value={closedMessage}
              onChangeText={setClosedMessage}
              maxLength={CLOSED_MESSAGE_MAX}
              placeholder="Books reopen in July"
              showCounter
            />
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
