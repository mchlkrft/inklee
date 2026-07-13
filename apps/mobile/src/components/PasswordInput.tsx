import { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { useColors } from "@/lib/theme";

type Props = Omit<TextInputProps, "secureTextEntry"> & {
  /** Applied to the wrapper View (use for margins, e.g. "mb-4"). */
  className?: string;
};

// Password field with a show/hide eye toggle, shared by sign-in + sign-up so
// the two auth screens cannot drift. The eye sits inside the field on the
// right; the input reserves pr-12 so typed text never runs under it.
// overflow-hidden + rounded-xl on the wrapper clips Android's autofill
// highlight, which is painted as a SQUARE rect over the input's full bounds
// and otherwise sticks out of the rounded corners (see BorderedInput).
export function PasswordInput({ className, ...props }: Props) {
  const colors = useColors();
  const [show, setShow] = useState(false);

  return (
    <View
      className={`relative justify-center overflow-hidden rounded-xl ${className ?? ""}`}
    >
      <TextInput
        {...props}
        secureTextEntry={!show}
        placeholderTextColor={props.placeholderTextColor ?? colors.shell.mute}
        className="h-12 rounded-xl border border-shell-border pl-4 pr-12 text-foreground"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={show ? "Hide password" : "Show password"}
        onPress={() => setShow((v) => !v)}
        hitSlop={8}
        className="absolute bottom-0 right-2 top-0 w-10 items-center justify-center active:opacity-70"
      >
        {show ? (
          <EyeOff size={18} color={colors.shell.dim} />
        ) : (
          <Eye size={18} color={colors.shell.dim} />
        )}
      </Pressable>
    </View>
  );
}
