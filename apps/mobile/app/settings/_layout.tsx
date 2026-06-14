import { Pressable } from "react-native";
import { router, Stack } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { darkStackScreenOptions } from "@/lib/nav-options";
import { colors } from "@/lib/tokens";

// The hub is the ROOT of this nested stack, so it gets no automatic back button
// (the deeper edit screens do). On iOS there's no hardware back, so the Settings
// hub needs an explicit chevron to return to the screen that opened it.
function HubBackButton() {
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      className="pr-2 active:opacity-60"
    >
      <Ionicons name="chevron-back" size={26} color={colors.bone} />
    </Pressable>
  );
}

// Settings stack — native headers (with a back button), charcoal. The index is
// the Settings hub (reached from the top-bar account menu); the rest are edit
// screens. Gated under the onboarded group by the root navigator.
export default function SettingsLayout() {
  return (
    <Stack screenOptions={darkStackScreenOptions}>
      <Stack.Screen
        name="index"
        options={{ title: "Settings", headerLeft: () => <HubBackButton /> }}
      />
      <Stack.Screen name="dashboard" options={{ title: "Home widgets" }} />
      <Stack.Screen name="profile" options={{ title: "Edit profile" }} />
      <Stack.Screen name="books" options={{ title: "Booking settings" }} />
      <Stack.Screen name="slots/index" options={{ title: "Time slots" }} />
      <Stack.Screen name="slots/new" options={{ title: "Add slots" }} />
      <Stack.Screen
        name="booking-form/index"
        options={{ title: "Booking form" }}
      />
      <Stack.Screen
        name="booking-form/[fieldId]"
        options={{ title: "Custom field" }}
      />
      <Stack.Screen
        name="deposit-defaults"
        options={{ title: "Deposit defaults" }}
      />
      <Stack.Screen
        name="deposit-policy"
        options={{ title: "Cancellation & refunds" }}
      />
      <Stack.Screen name="payouts" options={{ title: "Payouts" }} />
      <Stack.Screen
        name="calendar-export"
        options={{ title: "Calendar export" }}
      />
      <Stack.Screen name="emails" options={{ title: "Emails" }} />
      <Stack.Screen
        name="email-templates/[type]"
        options={{ title: "Edit template" }}
      />
      <Stack.Screen name="account" options={{ title: "Account & security" }} />
    </Stack>
  );
}
