import { Text, View } from "react-native";
import { humanStatusLabel } from "@inklee/shared/status-labels";

// Maps a raw booking/waitlist status to brand-tinted pill. Label text comes from
// the SHARED module so web and mobile read identically (proves the shared layer).
const TONE: Record<string, string> = {
  pending: "bg-mustard/20 text-mustard",
  approved: "bg-success/20 text-success",
  deposit_pending: "bg-rosa/20 text-rosa",
  rejected: "bg-shell-mute/20 text-shell-dim",
  cancelled: "bg-shell-mute/20 text-shell-dim",
};

export function StatusPill({ status }: { status: string }) {
  const tone = TONE[status] ?? "bg-shell-mute/20 text-shell-dim";
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${tone.split(" ")[0]}`}>
      <Text className={`text-xs font-semibold ${tone.split(" ")[1]}`}>
        {humanStatusLabel(status)}
      </Text>
    </View>
  );
}
