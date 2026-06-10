import { Stack } from "expo-router";
import { TopBar } from "@/components/TopBar";

// Flash tab stack. The index renders the floating TopBar (the (tabs) bottom-nav
// tab surface); drill-down screens (edit design, flash days) keep native back
// headers. Gated under the onboarded group by the root navigator.
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
      <Stack.Screen name="index" options={{ header: () => <TopBar /> }} />
      <Stack.Screen name="items/[id]" options={{ title: "Edit design" }} />
      <Stack.Screen name="days/index" options={{ title: "Flash days" }} />
      <Stack.Screen name="days/[id]" options={{ title: "Flash day" }} />
    </Stack>
  );
}
