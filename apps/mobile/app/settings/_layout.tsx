import { Stack } from "expo-router";
import { darkStackScreenOptions } from "@/lib/nav-options";

// Settings stack — native headers (with a back button), charcoal. The index is
// the Settings hub (reached from the top-bar account menu); the rest are edit
// screens. Gated under the onboarded group by the root navigator.
export default function SettingsLayout() {
  return (
    <Stack screenOptions={darkStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "Settings" }} />
      <Stack.Screen name="dashboard" options={{ title: "Home widgets" }} />
      <Stack.Screen name="profile" options={{ title: "Edit profile" }} />
      <Stack.Screen name="books" options={{ title: "Booking settings" }} />
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
