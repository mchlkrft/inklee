import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

type CardProps = { children: ReactNode; onPress?: () => void };

// Bone-tinted surface on the charcoal shell. Tappable when onPress is given.
// MB-2: web Card parity — 20px radius (rounded-card), 20px padding (p-5), and
// the signature 1.5px border (border-brand). API unchanged.
export function Card({ children, onPress }: CardProps) {
  const className =
    "rounded-card border-brand border-shell-border bg-[rgba(229,225,213,0.04)] p-5";
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className={className}
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
      >
        {children}
      </Pressable>
    );
  }
  return <View className={className}>{children}</View>;
}
