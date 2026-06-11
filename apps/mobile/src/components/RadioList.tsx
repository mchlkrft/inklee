import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/lib/theme";

type Option<T extends string> = { value: T; label: string };

// Vertical single-select list — for enum fields whose labels are too long for the
// horizontal Segmented control (e.g. studio visibility modes).
export function RadioList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-shell-border">
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            className={`flex-row items-center justify-between px-4 py-3 active:opacity-80 ${
              i > 0 ? "border-t border-shell-border" : ""
            }`}
          >
            <Text
              className={`flex-1 pr-3 text-base ${
                selected ? "text-foreground" : "text-shell-dim"
              }`}
            >
              {o.label}
            </Text>
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={selected ? colors.mustard : colors.shell.mute}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
