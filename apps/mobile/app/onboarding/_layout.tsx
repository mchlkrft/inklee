import { Stack } from "expo-router";
import { colors } from "@/lib/tokens";

// Onboarding wizard stack — mounted (gated by the root navigator) only while the
// artist is signed in but not yet onboarded. Headerless + charcoal; the screens
// drive their own flow: intro → claim → booking → done (with a resume jump
// straight to done when a slug already exists).
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.charcoal },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="claim" />
      <Stack.Screen name="booking" />
      <Stack.Screen name="done" />
    </Stack>
  );
}
