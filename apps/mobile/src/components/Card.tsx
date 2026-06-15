import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

type CardProps = { children: ReactNode; onPress?: () => void };

// Themed surface card. Tappable when onPress is given.
// MB-2: web Card parity — 20px radius (rounded-card), 20px padding (p-5), and
// the signature 1.5px border (border-brand). MB-12: themed `bg-card` surface.
export function Card({ children, onPress }: CardProps) {
  const className =
    "rounded-card border-brand border-shell-border bg-card p-5";
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
