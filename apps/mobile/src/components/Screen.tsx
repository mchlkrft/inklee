import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

// Themed app surface with safe-area insets. Every screen sits on this. Screens
// inside a native-header stack should pass edges={["left","right"]} — the header
// already consumes the top inset, so the default top edge would double it up.
// `topBar` renders OUTSIDE the px-5 content box (Yoga insets absolute children
// by the parent's padding), so the overlay TopBar can span the full width.
export function Screen({
  children,
  edges = ["top", "left", "right"],
  topBar,
}: {
  children: ReactNode;
  edges?: readonly Edge[];
  topBar?: ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={edges}>
      <View className="flex-1 px-5">{children}</View>
      {topBar ?? null}
    </SafeAreaView>
  );
}
