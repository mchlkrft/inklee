import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextArea } from "@/components/TextArea";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import { MAX_BOOKING_POLICY } from "@inklee/shared/bio-page";

// Booking policy lives in the shared bio_page model but is a booking-page concern
// (deposit / cancellation / minimum size), so it is edited here under booking
// settings and rendered on the public booking page, not on the Link Hub. Mirrors
// the web /bookings/settings booking-policy form; writes via the shared parser
// (POST /api/mobile/settings/booking-policy), which preserves the rest of bio_page.
type BookingPolicy = { bookingPolicy: string | null; show: boolean };

export default function BookingPolicyScreen() {
  useScreenView("settings_booking_policy");
  const q = useApiQuery<BookingPolicy>("/settings/booking-policy");
  const themed = useColors();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load booking policy"
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

function PolicyForm({ initial }: { initial: BookingPolicy }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();

  const [value, setValue] = useState(initial.bookingPolicy ?? "");
  const [show, setShow] = useState(initial.show);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await apiPost("/settings/booking-policy", {
        bookingPolicy: value.trim() || null,
        show,
      });
      await queryClient.invalidateQueries({
        queryKey: ["api", "/settings/booking-policy"],
      });
      router.back();
    } catch (e) {
      captureError(e, { op: "saveBookingPolicy" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]} column="form">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
      >
        <Text className="mb-4 text-sm text-shell-dim">
          Deposit, cancellation, minimum size, the work you take on. Shown on your
          booking page.
        </Text>

        <View className="mb-3 flex-row items-center justify-between">
          <Text className="flex-1 pr-3 text-sm text-foreground">
            Show on your booking page
          </Text>
          <Switch
            value={show}
            onValueChange={setShow}
            trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
            thumbColor={colors.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        </View>

        <TextArea
          value={value}
          onChangeText={setValue}
          maxLength={MAX_BOOKING_POLICY}
          showCounter
          minHeight={140}
          placeholder="e.g. A deposit holds your date. Deposits are non-refundable but carry to one reschedule with 48 hours notice."
          accessibilityLabel="Booking policy"
        />

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button label="Save" onPress={save} loading={saving} />
      </ScrollView>
    </Screen>
  );
}
