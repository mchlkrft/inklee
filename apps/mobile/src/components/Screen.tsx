import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { CAP, useScreenGutter } from "@/lib/layout";

// Themed app surface with safe-area insets. Every screen sits on this. Screens
// inside a native-header stack should pass edges={["left","right"]} — the header
// already consumes the top inset, so the default top edge would double it up.
// `topBar` renders OUTSIDE the px-5 content box (Yoga insets absolute children
// by the parent's padding), so the overlay TopBar can span the full width.
// `padded={false}` drops the horizontal content padding for full-bleed screens
// (e.g. the travel map, which must reach edge to edge); overlays inside then
// own their own margins.
//
// ME-15: `column` caps + centers the content at a canonical width (CAP in
// @/lib/layout) so screens stay readable on tablet windows. The cap wrapper is
// ALWAYS mounted when `column` is set (it is inert below its width), keeping
// the tree shape identical across window-class flips — children never remount
// on rotation/resize. Gutter widens 20 -> 24 -> 32 with the class; compact
// keeps the exact px-5 className (some screens' full-bleed tricks are tuned
// to its computed value — never swap it for a style padding of 20).
export function Screen({
  children,
  edges = ["top", "left", "right"],
  topBar,
  padded = true,
  column,
}: {
  children: ReactNode;
  edges?: readonly Edge[];
  topBar?: ReactNode;
  padded?: boolean;
  column?: keyof typeof CAP;
}) {
  const gutter = useScreenGutter();
  const body = column ? (
    <View
      style={{
        flex: 1,
        width: "100%",
        maxWidth: CAP[column],
        alignSelf: "center",
      }}
    >
      {children}
    </View>
  ) : (
    children
  );
  return (
    <SafeAreaView className="flex-1 bg-background" edges={edges}>
      <View
        className={padded && gutter === null ? "flex-1 px-5" : "flex-1"}
        style={padded && gutter !== null ? { paddingHorizontal: gutter } : undefined}
      >
        {body}
      </View>
      {topBar ?? null}
    </SafeAreaView>
  );
}
