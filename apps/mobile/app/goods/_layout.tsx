import { Stack } from "expo-router";

// Goods (showcase) stack — native headers, charcoal. Reached from More → Grow →
// Goods; gated under the onboarded group.
export default function GoodsLayout() {
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
      <Stack.Screen name="index" options={{ title: "Goods" }} />
      <Stack.Screen name="[id]" options={{ title: "Product" }} />
    </Stack>
  );
}
