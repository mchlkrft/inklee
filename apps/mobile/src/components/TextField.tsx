import { useState, type ReactNode } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { useColors } from "@/lib/theme";

type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  /** Leading adornment inside the field (e.g. the fixed "@" on the Instagram handle). */
  leftSlot?: ReactNode;
  /** Right-aligned adornment inside the field (e.g. the slug-availability tick). */
  rightSlot?: ReactNode;
};

// Bordered charcoal input. MB-2: signature 1.5px border (border-brand) with a
// rosa focus ring and a danger border on error, matching the web input feel.
// Caller TextInput props spread through; onFocus/onBlur are wrapped so the focus
// ring works AND the caller's handlers still fire. The field's own className +
// placeholderTextColor are applied AFTER the spread so they win (NativeWind does
// not merge two className props on one element).
export function TextField({
  label,
  hint,
  error,
  leftSlot,
  rightSlot,
  onFocus,
  onBlur,
  style,
  ...input
}: TextFieldProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? "border-danger"
    : focused
      ? "border-rosa"
      : "border-shell-border";
  return (
    <View className="mb-3">
      {label ? (
        <Text className="mb-1.5 text-sm font-medium text-foreground">{label}</Text>
      ) : null}
      <View
        className={`h-12 flex-row items-center rounded-xl border-brand px-4 ${borderColor}`}
      >
        {leftSlot ? <View className="pr-2">{leftSlot}</View> : null}
        <TextInput
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor={colors.shell.mute}
          // The visible <Text> label isn't programmatically linked to the input,
          // so default the accessible name to it (callers can still override),
          // otherwise screen readers announce these as unlabeled fields.
          accessibilityLabel={input.accessibilityLabel ?? label}
          className="h-full flex-1 text-foreground"
          // Vertical centering: a `lineHeight` (which `text-base` sets) offsets
          // single-line text on iOS, so set the size directly with no line
          // height; zero the default padding and center on Android.
          style={[
            {
              fontSize: 16,
              paddingVertical: 0,
              textAlignVertical: "center",
              includeFontPadding: false,
            },
            style,
          ]}
        />
        {rightSlot ? <View className="pl-2">{rightSlot}</View> : null}
      </View>
      {error ? (
        <Text className="mt-1 text-xs text-danger-fg">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-shell-dim">{hint}</Text>
      ) : null}
    </View>
  );
}
