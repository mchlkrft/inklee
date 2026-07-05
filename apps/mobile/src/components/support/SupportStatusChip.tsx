import { Text, View } from "react-native";
import { SUPPORT_STATUS_LABELS, type SupportStatus } from "@inklee/shared/support";

// Mirrors the web SupportStatusChip semantics (StatusBadge rule: solid brand
// fills) from the artist's point of view:
//   awaiting_artist          -> mustard (your turn)
//   open / awaiting_support  -> rosa    (waiting on the Inklee team)
//   resolved                 -> green   (done)
//   closed                   -> muted   (archived, sits quietly)
const CHIP: Record<SupportStatus, { box: string; text: string }> = {
  open: { box: "bg-rosa", text: "text-charcoal" },
  awaiting_support: { box: "bg-rosa", text: "text-charcoal" },
  awaiting_artist: { box: "bg-mustard", text: "text-charcoal" },
  resolved: { box: "bg-success", text: "text-bone" },
  closed: { box: "bg-shell-hover", text: "text-foreground" },
};

export function SupportStatusChip({ status }: { status: SupportStatus }) {
  const c = CHIP[status];
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${c.box}`}>
      <Text className={`text-xs font-semibold ${c.text}`}>
        {SUPPORT_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}
