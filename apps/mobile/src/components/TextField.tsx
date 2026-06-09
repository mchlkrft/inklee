import { type ReactNode } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "@/lib/tokens";

type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  /** Right-aligned adornment inside the field (e.g. the slug-availability tick). */
  rightSlot?: ReactNode;
};

// Bordered charcoal input, factored out of the hand-copied version in
// sign-in.tsx / account/delete.tsx now that onboarding adds four more fields.
// Label + optional hint/error line + an optional right slot. Caller TextInput
// props (value, onChangeText, autoCapitalize, …) spread through; the field's own
// className + placeholderTextColor are applied AFTER the spread, so they win over
// any caller-passed values (last JSX prop wins — NativeWind does not merge two
// className props on one element).
export function TextField({
  label,
  hint,
  error,
  rightSlot,
  ...input
}: TextFieldProps) {
  return (
    <View className="mb-3">
      {label ? (
        <Text className="mb-1.5 text-sm font-medium text-bone">{label}</Text>
      ) : null}
      <View className="h-12 flex-row items-center rounded-xl border border-shell-border px-4">
        <TextInput
          {...input}
          placeholderTextColor={colors.shell.mute}
          className="h-full flex-1 text-base text-bone"
        />
        {rightSlot ? <View className="pl-2">{rightSlot}</View> : null}
      </View>
      {error ? (
        <Text className="mt-1 text-xs text-danger">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-shell-dim">{hint}</Text>
      ) : null}
    </View>
  );
}
