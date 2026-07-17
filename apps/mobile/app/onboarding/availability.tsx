import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { isBookingMode, type BookingMode } from "@inklee/shared/booking-domain";
import type { MobileOnboardingBooking } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { ModeCard } from "@/components/ModeCard";
import { TextField } from "@/components/TextField";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { apiPost, invalidateIdentity } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";

// Wizard step 3 (mirrors the web availability step). Receives the booking mode
// chosen on the previous screen as a route param, then performs the single
// /onboarding/booking write (mode + open flag + optional closed message) — the
// endpoint still collapses booking + availability server-side, but the artist
// now answers them on two screens like the web. There is no Skip: Continue
// commits the pre-filled defaults (Open), which is the same value a web skip
// would have left.
const CLOSED_MESSAGE_MAX = 280;

export default function AvailabilitySetup() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const themed = useColors();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: BookingMode = isBookingMode(params.mode)
    ? params.mode
    : "preferred_date";

  const [booksOpen, setBooksOpen] = useState(true);
  const [closedMessage, setClosedMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await apiPost<MobileOnboardingBooking>("/onboarding/booking", {
        bookingMode: mode,
        booksOpen,
        booksClosedMessage: booksOpen
          ? undefined
          : closedMessage.trim() || undefined,
      });
      await invalidateIdentity(queryClient);
      router.push("/onboarding/form");
    } catch (e) {
      captureError(e, { op: "onboardingAvailability" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen column="form">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View className="-ml-2 mt-1 self-start">
          <IconButton
            icon={ChevronLeft}
            label="Back"
            onPress={() => router.back()}
            iconSize={22}
            color={themed.bone}
          />
        </View>

        <View className="mt-2">
          <OnboardingProgress current={3} />
        </View>

        <View className="pb-6">
          <Text className="text-2xl font-bold text-foreground">
            Availability
          </Text>
          <Text className="mt-1 text-base text-shell-dim">
            Should your booking page be open for requests right away?
          </Text>
        </View>

        <ModeCard
          title="Open for bookings"
          body="Clients can submit requests as soon as your link is live."
          selected={booksOpen}
          onPress={() => setBooksOpen(true)}
        />
        <ModeCard
          title="Not yet, open later"
          body="Your page exists but clients cannot submit requests until you open it in settings."
          selected={!booksOpen}
          onPress={() => setBooksOpen(false)}
        />

        {!booksOpen ? (
          <View className="mt-2">
            <TextField
              label="Closed message (optional)"
              value={closedMessage}
              onChangeText={(v) =>
                setClosedMessage(v.slice(0, CLOSED_MESSAGE_MAX))
              }
              placeholder="Books opening soon. Check my Instagram for updates"
              autoCapitalize="sentences"
            />
          </View>
        ) : null}

        {error ? (
          <Text className="mt-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <View className="mt-6">
          <Button label="Continue" onPress={submit} loading={submitting} />
        </View>
      </ScrollView>
    </Screen>
  );
}
