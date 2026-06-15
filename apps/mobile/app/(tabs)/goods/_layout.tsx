import { Stack } from "expo-router";
import { darkStackScreenOptions } from "@/lib/nav-options";

// Goods (showcase) tab stack. The index screen renders the floating TopBar
// itself as an absolute overlay; the product detail keeps a native back header.
// Gated under the onboarded group.
export default function GoodsLayout() {
  return (
    <Stack screenOptions={darkStackScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: "Product" }} />
    </Stack>
  );
}
