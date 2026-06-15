import { colors } from "./tokens";

// Shared screenOptions for the fixed-dark drill-down stacks (flash, goods,
// travel, settings). Was copy-pasted with raw hex literals in four layouts and
// had already drifted from the themed root-stack header (app/_layout.tsx) —
// whether these headers should follow the theme instead is a separate design
// question; this only de-duplicates the current values.
export const darkStackScreenOptions = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.charcoal },
  headerTintColor: colors.bone,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.charcoal },
} as const;
