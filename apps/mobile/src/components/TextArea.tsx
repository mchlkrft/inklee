import { useState } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { useColors } from "@/lib/theme";

type TextAreaProps = Omit<TextInputProps, "multiline"> & {
  label?: string;
  /** Show a "length/maxLength" counter (requires maxLength). */
  showCounter?: boolean;
  minHeight?: number;
};

// Bordered multiline input. MB-2: 1.5px border (border-brand) + rosa focus ring,
// matching TextField. Caller TextInput props spread through; onFocus/onBlur are
// wrapped so the focus ring works without dropping the caller's handlers.
export function TextArea({
  label,
  showCounter = false,
  minHeight = 64,
  value,
  maxLength,
  onFocus,
  onBlur,
  ...input
}: TextAreaProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const length = typeof value === "string" ? value.length : 0;
  const borderColor = focused ? "border-rosa" : "border-shell-border";
  return (
    <View className="mb-3">
      {label ? (
        <Text className="mb-1.5 text-sm font-medium text-foreground">{label}</Text>
      ) : null}
      <View className={`rounded-xl border-brand px-4 py-3 ${borderColor}`}>
        <TextInput
          value={value}
          maxLength={maxLength}
          multiline
          placeholderTextColor={colors.shell.mute}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[{ minHeight, textAlignVertical: "top" }, input.style]}
          className="text-base text-foreground"
        />
      </View>
      {showCounter && maxLength ? (
        <Text className="mt-1 text-right text-xs text-shell-mute">
          {length}/{maxLength}
        </Text>
      ) : null}
    </View>
  );
}
