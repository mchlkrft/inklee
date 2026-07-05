import { Stack } from "expo-router";
import { darkStackScreenOptions } from "@/lib/nav-options";

// Flash tab stack. The index screen renders the floating TopBar itself as an
// absolute overlay; drill-down screens (edit design, flash days) keep native
// back headers. Gated under the onboarded group by the root navigator.
export default function FlashLayout() {
  return (
    <Stack screenOptions={darkStackScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="items/[id]" options={{ title: "Edit design" }} />
      <Stack.Screen name="instagram" options={{ title: "Instagram" }} />
      <Stack.Screen name="days/index" options={{ title: "Flash days" }} />
      <Stack.Screen name="days/[id]" options={{ title: "Flash day" }} />
    </Stack>
  );
}
