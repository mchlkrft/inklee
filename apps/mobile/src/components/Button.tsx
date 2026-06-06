import { ActivityIndicator, Pressable, Text } from "react-native";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
};

// Primary = mustard on charcoal; secondary = outlined bone.
export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const base =
    "h-12 items-center justify-center rounded-xl px-5 active:opacity-80";
  const tone = isPrimary
    ? "bg-mustard"
    : "border border-shell-border bg-transparent";
  const textTone = isPrimary ? "text-charcoal" : "text-bone";
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`${base} ${tone} ${isDisabled ? "opacity-50" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#1e1e1e" : "#e5e1d5"} />
      ) : (
        <Text className={`text-base font-semibold ${textTone}`}>{label}</Text>
      )}
    </Pressable>
  );
}
