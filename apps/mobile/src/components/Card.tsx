import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

type CardProps = { children: ReactNode; onPress?: () => void };

// Bone-tinted surface on the charcoal shell. Tappable when onPress is given.
export function Card({ children, onPress }: CardProps) {
  const className =
    "rounded-2xl border border-shell-border bg-[rgba(229,225,213,0.04)] p-4";
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
