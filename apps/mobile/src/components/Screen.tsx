import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

// Charcoal app shell with safe-area insets. Every screen sits on this. Screens
// inside a native-header stack should pass edges={["left","right"]} — the header
// already consumes the top inset, so the default top edge would double it up.
export function Screen({
  children,
  edges = ["top", "left", "right"],
}: {
  children: ReactNode;
  edges?: readonly Edge[];
}) {
  return (
    <SafeAreaView className="flex-1 bg-charcoal" edges={edges}>
      <View className="flex-1 px-5">{children}</View>
    </SafeAreaView>
  );
}
