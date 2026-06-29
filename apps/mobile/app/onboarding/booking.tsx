import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { BookingMode } from "@inklee/shared/booking-domain";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { ModeCard } from "@/components/ModeCard";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { useColors } from "@/lib/theme";

// Wizard step 2 (mirrors the web booking step). Picks the booking mode only —
// availability moved to its own step (availability.tsx) to match the web flow.
// The mode is carried forward as a route param; the single /onboarding/booking
// write happens on the availability step, so nothing persists here.
const MODES: { value: BookingMode; title: string; body: string }[] = [
  {
    value: "preferred_date",
    title: "Request a date",
    body: "Clients suggest a date and details. You confirm or negotiate. Best for most artists.",
  },
  {
    value: "fixed_slots",
    title: "Fixed slots",
    body: "You publish specific time slots. Clients pick one.",
  },
];

export default function BookingSetup() {
  const router = useRouter();
  const themed = useColors();
  const [mode, setMode] = useState<BookingMode>("preferred_date");

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
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
          <OnboardingProgress current={2} />
        </View>

        <View className="pb-6">
          <Text className="text-2xl font-bold text-foreground">
            How do clients book?
          </Text>
          <Text className="mt-1 text-base text-shell-dim">
            You can change this any time in Booking settings.
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

        <View className="mt-6">
          <Button
            label="Continue"
            onPress={() =>
              router.push({
                pathname: "/onboarding/availability",
                params: { mode },
              })
            }
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
