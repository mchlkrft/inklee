import { Text } from "react-native";

// Uppercase section header for grouped settings screens. One definition for
// what was four local copies (account / booking-form / settings hub / profile).
// Default size matches the original idiom (text-xs); profile uses "sm" per the
// founder round-5 readability pass.
export function SectionLabel({
  children,
  size = "xs",
}: {
  children: string;
  size?: "xs" | "sm";
}) {
  return (
    <Text
      className={`mb-2 mt-6 ${size === "sm" ? "text-sm" : "text-xs"} font-semibold uppercase tracking-wide text-shell-mute`}
    >
      {children}
    </Text>
  );
}
