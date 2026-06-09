import { Stack } from "expo-router";

// Flash management stack — native headers, charcoal. Reached from More → Flash;
// gated under the onboarded group by the root navigator.
export default function FlashLayout() {
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
      <Stack.Screen name="index" options={{ title: "Flash" }} />
      <Stack.Screen name="items/[id]" options={{ title: "Edit design" }} />
      <Stack.Screen name="days/index" options={{ title: "Flash days" }} />
      <Stack.Screen name="days/[id]" options={{ title: "Flash day" }} />
    </Stack>
  );
}
