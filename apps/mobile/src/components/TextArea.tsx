import { Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "@/lib/tokens";

type TextAreaProps = Omit<TextInputProps, "multiline"> & {
  label?: string;
  /** Show a "length/maxLength" counter (requires maxLength). */
  showCounter?: boolean;
  minHeight?: number;
};

// Bordered multiline input, factored out of the hand-copied
// <View border><TextInput multiline/></View> blocks across the edit screens.
// Caller TextInput props spread through; the field's own styling is applied last
// so it can't be clobbered.
export function TextArea({
  label,
  showCounter = false,
  minHeight = 64,
  value,
  maxLength,
  ...input
}: TextAreaProps) {
  const length = typeof value === "string" ? value.length : 0;
  return (
    <View className="mb-3">
      {label ? (
        <Text className="mb-1.5 text-sm font-medium text-bone">{label}</Text>
      ) : null}
      <View className="rounded-xl border border-shell-border px-4 py-3">
        <TextInput
          value={value}
          maxLength={maxLength}
          multiline
          placeholderTextColor={colors.shell.mute}
          {...input}
          style={[{ minHeight, textAlignVertical: "top" }, input.style]}
          className="text-base text-bone"
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
