import { Pressable, Text, View } from "react-native";

type Option<T extends string> = { value: T; label: string };

// A small inline segmented control for enum fields (mustard fill on the selected
// segment). Group-wraps for >3 options.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="mb-3 flex-row flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            // Unselected segments get a contrasting fill + full-contrast text so
            // the control stays legible in light mode (a bare hairline border on
            // the bone card was nearly invisible).
            className={`h-11 min-w-[88px] flex-1 items-center justify-center rounded-xl border active:opacity-80 ${
              selected
                ? "border-mustard bg-mustard"
                : "border-shell-border bg-background"
            }`}
          >
            <Text
              numberOfLines={1}
              className={`text-sm font-medium ${
                selected ? "text-charcoal" : "text-foreground"
              }`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
