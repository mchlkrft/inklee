import { Stack } from "expo-router";

// Goods (showcase) tab stack. The index screen renders the floating TopBar
// itself as an absolute overlay; the product detail keeps a native back header.
// Gated under the onboarded group.
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: "Product" }} />
    </Stack>
  );
}
