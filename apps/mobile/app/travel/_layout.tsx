import { Stack } from "expo-router";

// Travel / guest-spots stack — native headers, charcoal. Reached from More →
// Grow → Guest spots; gated under the onboarded group.
export default function TravelLayout() {
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
      <Stack.Screen name="index" options={{ title: "Guest spots" }} />
      <Stack.Screen name="trips/[id]" options={{ title: "Trip" }} />
      <Stack.Screen name="studios/index" options={{ title: "Studios" }} />
      <Stack.Screen name="studios/[id]" options={{ title: "Studio" }} />
    </Stack>
  );
}
