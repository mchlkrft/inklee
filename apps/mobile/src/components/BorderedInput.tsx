import { TextInput, View, type TextInputProps } from "react-native";
import { useColors } from "@/lib/theme";

type Props = TextInputProps & {
  /** Applied to the wrapper View (use for margins, e.g. "mb-3"). */
  className?: string;
};

// Plain bordered single-line input (the auth-screen field style), shared by
// sign-in, sign-up, forgot-password and account-delete so they cannot drift.
// The wrapper clips to the field's radius because Android paints its autofill
// highlight as a SQUARE rectangle over the input's full bounds, which
// otherwise sticks out past the rounded corners and the border hairline. iOS
// draws no such overlay, so the clip is a no-op there.
export function BorderedInput({ className, ...props }: Props) {
  const colors = useColors();
  return (
    <View className={`overflow-hidden rounded-xl ${className ?? ""}`}>
      <TextInput
        {...props}
        placeholderTextColor={props.placeholderTextColor ?? colors.shell.mute}
        className="h-12 rounded-xl border border-shell-border px-4 text-foreground"
      />
    </View>
  );
}
