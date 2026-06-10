import { ActivityIndicator, Pressable, Text } from "react-native";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
};

// Primary = mustard on charcoal; secondary = outlined bone.
// MB-2: pill shape (rounded-full) + size scale + press-translate to match the
// web button feel. (Haptics on primary actions land in the MB-11 native pass.)
const SIZES = {
  xs: "h-9 px-4",
  sm: "h-10 px-4",
  md: "h-12 px-5",
  lg: "h-14 px-6",
} as const;

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const base = `items-center justify-center rounded-full ${SIZES[size]}`;
  const tone = isPrimary
    ? "bg-mustard"
    : "border-brand border-shell-border bg-transparent";
  const textTone = isPrimary ? "text-charcoal" : "text-bone";
  const textSize = size === "xs" || size === "sm" ? "text-sm" : "text-base";
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`${base} ${tone} ${isDisabled ? "opacity-50" : ""}`}
      style={({ pressed }) =>
        pressed && !isDisabled
          ? { transform: [{ translateY: 1 }], opacity: 0.9 }
          : null
      }
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#1e1e1e" : "#e5e1d5"} />
      ) : (
        <Text className={`font-semibold ${textSize} ${textTone}`}>{label}</Text>
      )}
    </Pressable>
  );
}
