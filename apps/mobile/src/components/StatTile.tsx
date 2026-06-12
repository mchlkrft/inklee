import { Pressable, Text, View } from "react-native";

// Big-number stat tile (founder round 4: "prominent big numbers" on the
// bookings tab). Follows the home-screen big-number language (text-display
// bold foreground over a caption label) on a compact card surface — tighter
// than Card's p-5 so a 3-up strip stays low. Tappable when onPress is given.
// `compact` (founder round 8): one centered line, bold number + lowercase
// label at the same size ("26 pending") — used while the filter strip is open
// to win the header height back.
export function StatTile({
  value,
  label,
  onPress,
  compact = false,
}: {
  value: number | null;
  label: string;
  onPress?: () => void;
  compact?: boolean;
}) {
  const className = compact
    ? "flex-1 items-center justify-center rounded-card border-brand border-shell-border bg-card px-2 py-2.5"
    : "flex-1 rounded-card border-brand border-shell-border bg-card px-4 py-3";
  const body = compact ? (
    <Text className="text-center text-sm text-shell-dim" numberOfLines={1}>
      <Text className="font-bold text-foreground">{value ?? "-"}</Text>{" "}
      {label.toLowerCase()}
    </Text>
  ) : (
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
