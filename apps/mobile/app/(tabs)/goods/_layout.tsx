import { Stack } from "expo-router";
import { TopBar } from "@/components/TopBar";

// Goods (showcase) tab stack. The index renders the floating TopBar; the product
// detail keeps a native back header. Gated under the onboarded group.
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
      <Stack.Screen name="index" options={{ header: () => <TopBar /> }} />
      <Stack.Screen name="[id]" options={{ title: "Product" }} />
    </Stack>
  );
}
