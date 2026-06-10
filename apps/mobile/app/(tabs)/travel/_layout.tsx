import { Stack } from "expo-router";
import { TopBar } from "@/components/TopBar";

// Guest Spots (travel) tab stack. The index renders the floating TopBar; trip
// and studio drill-down screens keep native back headers. Gated under the
// onboarded group.
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
      <Stack.Screen name="index" options={{ header: () => <TopBar /> }} />
      <Stack.Screen name="trips/[id]" options={{ title: "Trip" }} />
      <Stack.Screen name="studios/index" options={{ title: "Studios" }} />
      <Stack.Screen name="studios/[id]" options={{ title: "Studio" }} />
    </Stack>
  );
}
