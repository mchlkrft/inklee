import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ChevronLeft } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { BookingMode } from "@inklee/shared/booking-domain";
import type { MobileOnboardingBooking } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { TextField } from "@/components/TextField";
import { apiPost, invalidateIdentity } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";

const MODES: { value: BookingMode; title: string; body: string }[] = [
  {
    value: "preferred_date",
    title: "Request a date",
    body: "Clients suggest a date and details — you approve each one. Best for most artists.",
  },
  {
    value: "fixed_slots",
    title: "Fixed slots",
    body: "You publish specific time slots. Slots are set up on the web for now.",
  },
];

function ModeCard({
  title,
  body,
  selected,
  onPress,
}: {
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      // border-accent: a mustard selection ring is near-invisible on the light
      // bone background (dark mode unchanged); the mustard wash stays per the
      // tint convention.
      className={`mb-3 rounded-2xl border p-4 active:opacity-80 ${
        selected
          ? "border-accent bg-[rgba(233,178,43,0.08)]"
          : "border-shell-border bg-glass"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-foreground">{title}</Text>
        <ThemedRadioIcon selected={selected} />
      </View>
      <Text className="mt-1 text-sm text-shell-dim">{body}</Text>
    </Pressable>
  );
}

// Themed radio glyph: the idle state must follow the scheme (the static dark
// token is invisible on the light background).
function ThemedRadioIcon({ selected }: { selected: boolean }) {
  const themed = useColors();
  return (
    <Ionicons
      name={selected ? "radio-button-on" : "radio-button-off"}
      size={20}
      color={selected ? themed.accent : themed.shell.mute}
    />
  );
}

function StatusPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-11 flex-1 items-center justify-center rounded-xl border active:opacity-80 ${
        selected ? "border-mustard bg-mustard" : "border-shell-border"
      }`}
    >
      <Text
        className={`text-sm font-semibold ${
          selected ? "text-charcoal" : "text-shell-dim"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function BookingSetup() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const themed = useColors();

  const [mode, setMode] = useState<BookingMode>("preferred_date");
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
      router.push("/onboarding/done");
    } catch (e) {
      captureError(e, { op: "onboardingBooking" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
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

        <View className="pb-6 pt-2">
          <Text className="text-2xl font-bold text-foreground">
            How do clients book?
          </Text>
          <Text className="mt-1 text-base text-shell-dim">
            You can change this any time in More.
          </Text>
        </View>

        {MODES.map((m) => (
          <ModeCard
            key={m.value}
            title={m.title}
            body={m.body}
            selected={mode === m.value}
            onPress={() => setMode(m.value)}
          />
        ))}

        <Text className="mb-2 mt-5 text-sm font-medium text-foreground">
          Booking status
        </Text>
        <View className="flex-row gap-3">
          <StatusPill
            label="Open"
            selected={booksOpen}
            onPress={() => setBooksOpen(true)}
          />
          <StatusPill
            label="Closed"
            selected={!booksOpen}
            onPress={() => setBooksOpen(false)}
          />
        </View>
        <Text className="mt-2 text-xs text-shell-dim">
          {booksOpen
            ? "Your page accepts new requests right away."
            : "Your page shows a closed notice — open it whenever you're ready."}
        </Text>

        {!booksOpen ? (
          <View className="mt-4">
            <TextField
              label="Closed message (optional)"
              value={closedMessage}
              onChangeText={setClosedMessage}
              placeholder="Books reopen in July"
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
