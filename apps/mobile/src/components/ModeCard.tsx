import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useColors } from "@/lib/theme";

// Radio card for the booking-mode choice (onboarding + booking settings):
// title + body copy + a themed radio glyph. RadioList is label-only, so enum
// choices that need explanatory body text use this instead.
export function ModeCard({
  title,
  body,
  selected,
  onPress,
}: {
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      // border-accent: a mustard selection ring is near-invisible on the light
      // bone background (dark mode unchanged); the mustard wash stays per the
      // tint convention.
      className={`mb-3 rounded-2xl border p-4 active:opacity-80 ${
        selected
          ? "border-accent bg-[rgba(233,178,43,0.08)]"
          : "border-shell-border bg-glass"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-foreground">{title}</Text>
        <ThemedRadioIcon selected={selected} />
      </View>
      <Text className="mt-1 text-sm text-shell-dim">{body}</Text>
    </Pressable>
  );
}

// Themed radio glyph: the idle state must follow the scheme (the static dark
// token is invisible on the light background).
function ThemedRadioIcon({ selected }: { selected: boolean }) {
  const themed = useColors();
  return (
    <Ionicons
      name={selected ? "radio-button-on" : "radio-button-off"}
      size={20}
      color={selected ? themed.accent : themed.shell.mute}
    />
  );
}
