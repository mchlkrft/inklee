import { ActivityIndicator, Pressable, Text } from "react-native";
import type { LucideIcon } from "@/lib/icon-types";
import { colors } from "@/lib/tokens";
import { useColors } from "@/lib/theme";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "danger-outline";
  size?: "xs" | "sm" | "md" | "lg";
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
};

// Primary = mustard on charcoal; secondary = outlined bone; danger = filled
// red; danger-outline = red outline for less-loud destructive row actions.
// Founder round 4 button sweep: ONE pill scale for every button in the app —
// md (52px) is the full-width CTA default, sm (44px) covers inline/row actions
// at Apple's 44pt minimum. h-13 = 52px is declared in tailwind.config.js.
const SIZES = {
  xs: "h-9 px-4",
  sm: "h-11 px-5",
  md: "h-13 px-6",
  lg: "h-14 px-7",
} as const;

const TONES = {
  primary: {
    box: "bg-mustard",
    text: "text-charcoal",
    spinner: () => colors.charcoal,
  },
  secondary: {
    box: "border-brand border-shell-border bg-transparent",
    text: "text-foreground",
    spinner: (themed: ReturnType<typeof useColors>) => themed.bone,
  },
  danger: {
    box: "bg-danger",
    text: "text-bone",
    spinner: () => colors.bone,
  },
  "danger-outline": {
    // Border keeps the brand red (alpha modifiers don't work on the var);
    // the label uses the readable themed danger (ME-4).
    box: "border-brand border-danger/50 bg-transparent",
    text: "text-danger-fg",
    spinner: (themed: ReturnType<typeof useColors>) => themed.dangerFg,
  },
} as const;

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon: Icon,
  loading = false,
  disabled = false,
}: ButtonProps) {
  const themed = useColors();
  const tone = TONES[variant];
  const base = `flex-row items-center justify-center gap-2 rounded-full ${SIZES[size]}`;
  const textSize = size === "xs" || size === "sm" ? "text-sm" : "text-base";
  const isDisabled = disabled || loading;
  const fg =
    variant === "primary"
      ? colors.charcoal
      : variant === "danger"
        ? colors.bone
        : variant === "danger-outline"
          ? themed.dangerFg
          : themed.bone;

  return (
    <Pressable
      accessibilityRole="button"
      // The spinner replaces the label child while loading, so the accessible
      // name must live on the Pressable or the button goes nameless mid-action.
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      className={`${base} ${tone.box} ${isDisabled ? "opacity-50" : ""}`}
      style={({ pressed }) =>
        pressed && !isDisabled
          ? { transform: [{ translateY: 1 }], opacity: 0.9 }
          : null
      }
    >
      {loading ? (
        <ActivityIndicator color={tone.spinner(themed)} />
      ) : (
        <>
          {Icon ? <Icon size={18} color={fg} /> : null}
          {/* Never wrap inside the fixed-height pill: a tight two-up row
              shrinks the label slightly instead. */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            className={`font-semibold ${textSize} ${tone.text}`}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
