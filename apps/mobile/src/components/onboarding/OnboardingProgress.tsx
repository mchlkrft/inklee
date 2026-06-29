import { Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "@/lib/tokens";

// Native twin of the web onboarding-progress.tsx — the 5-step wizard pill row
// (Link → Booking → Availability → Form → Done) so the mobile wizard mirrors the
// web flow (ME-12). Display-only on native: the per-screen back chevron handles
// stepping back, so the dots don't need to be tappable like the web's jump-back
// links. Done = filled mustard + check; active = mustard ring; future = bordered
// number. Mustard is a fixed brand atom, so the check colour is static charcoal.
const STEPS = ["Link", "Booking", "Availability", "Form", "Done"] as const;

export function OnboardingProgress({
  current,
}: {
  current: 1 | 2 | 3 | 4 | 5;
}) {
  return (
    <View className="mb-6 gap-2">
      <View className="flex-row items-center gap-1.5">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          const isLast = i === STEPS.length - 1;
          return (
            <View
              key={label}
              className={`flex-row items-center gap-1.5 ${isLast ? "" : "flex-1"}`}
            >
              <View
                className={`h-6 w-6 items-center justify-center rounded-full ${
                  done
                    ? "bg-mustard"
                    : active
                      ? "border-2 border-mustard"
                      : "border border-shell-border"
                }`}
              >
                {done ? (
                  <Check size={13} color={colors.charcoal} strokeWidth={3} />
                ) : (
                  <Text
                    className={`text-xs font-medium ${
                      active ? "text-foreground" : "text-shell-mute"
                    }`}
                  >
                    {step}
                  </Text>
                )}
              </View>
              {!isLast ? (
                <View
                  className={`h-px flex-1 ${done ? "bg-mustard" : "bg-shell-border"}`}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <Text className="text-xs text-shell-dim">
        Step {current} of {STEPS.length}: {STEPS[current - 1]}
      </Text>
    </View>
  );
}
