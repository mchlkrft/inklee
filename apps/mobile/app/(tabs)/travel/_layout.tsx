import { Stack } from "expo-router";
import { darkStackScreenOptions } from "@/lib/nav-options";

// Guest Spots (travel) tab stack. The index screen renders the floating TopBar
// itself as an absolute overlay; trip and studio drill-down screens keep native
// back headers. Gated under the onboarded group.
export default function TravelLayout() {
  return (
    <Stack screenOptions={darkStackScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="trips/[id]" options={{ title: "Trip" }} />
      <Stack.Screen name="studios/index" options={{ title: "Studios" }} />
      <Stack.Screen name="studios/[id]" options={{ title: "Studio" }} />
    </Stack>
  );
}
