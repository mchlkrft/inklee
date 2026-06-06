import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Charcoal app shell with safe-area insets. Every screen sits on this.
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-charcoal" edges={["top", "left", "right"]}>
      <View className="flex-1 px-5">{children}</View>
    </SafeAreaView>
  );
}
