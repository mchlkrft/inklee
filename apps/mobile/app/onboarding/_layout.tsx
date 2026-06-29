import { Stack } from "expo-router";
import { colors } from "@/lib/tokens";

// Onboarding wizard stack — mounted (gated by the root navigator) only while the
// artist is signed in but not yet onboarded. Headerless + charcoal; the screens
// drive their own flow: intro → claim → booking → availability → form → done
// (mirrors the web 5-step wizard; resume jumps straight to done when a slug
// already exists).
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
      <Stack.Screen name="availability" />
      <Stack.Screen name="form" />
      <Stack.Screen name="done" />
    </Stack>
  );
}
