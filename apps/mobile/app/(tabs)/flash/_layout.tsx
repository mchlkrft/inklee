import { Stack } from "expo-router";

// Flash tab stack. The index screen renders the floating TopBar itself as an
// absolute overlay; drill-down screens (edit design, flash days) keep native
// back headers. Gated under the onboarded group by the root navigator.
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="items/[id]" options={{ title: "Edit design" }} />
      <Stack.Screen name="days/index" options={{ title: "Flash days" }} />
      <Stack.Screen name="days/[id]" options={{ title: "Flash day" }} />
    </Stack>
  );
}
