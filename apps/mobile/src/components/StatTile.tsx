import { Pressable, Text, View } from "react-native";

// Big-number stat tile (founder round 4: "prominent big numbers" on the
// bookings tab). Follows the home-screen big-number language (text-display
// bold foreground over a caption label) on a compact card surface — tighter
// than Card's p-5 so a 3-up strip stays low. Tappable when onPress is given.
export function StatTile({
  value,
  label,
  onPress,
}: {
  value: number | null;
  label: string;
  onPress?: () => void;
}) {
  const className =
    "flex-1 rounded-card border-brand border-shell-border bg-card px-4 py-3";
  const body = (
    <>
      <Text className="text-display font-bold text-foreground">
        {value ?? "-"}
      </Text>
      <Text className="text-caption text-shell-dim">{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        // No "loading" claim: a settled error also leaves value null, and the
        // placeholder would otherwise read as loading forever.
        accessibilityLabel={value != null ? `${label}: ${value}` : label}
        onPress={onPress}
        className={className}
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
      >
        {body}
      </Pressable>
    );
  }
  return <View className={className}>{body}</View>;
}
