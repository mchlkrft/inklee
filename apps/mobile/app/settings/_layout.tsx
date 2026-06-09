import { Stack } from "expo-router";

// Settings edit stack — native headers (with a back button), charcoal. Reached
// from the More tab; gated under the onboarded group by the root navigator.
export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: "#1e1e1e" },
        headerTintColor: "#e5e1d5",
        headerShadowVisible: false,
        contentStyle: { backgroundColor: "#1e1e1e" },
      }}
    >
      <Stack.Screen name="profile" options={{ title: "Edit profile" }} />
      <Stack.Screen name="books" options={{ title: "Booking settings" }} />
      <Stack.Screen
        name="deposit-defaults"
        options={{ title: "Deposit defaults" }}
      />
      <Stack.Screen name="payouts" options={{ title: "Payouts" }} />
    </Stack>
  );
}
