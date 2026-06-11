import { Text, View } from "react-native";
import { humanStatusLabel } from "@inklee/shared/status-labels";

// Solid status fills (plan §3.6). Saturated brand colors read on either theme
// as-is (mustard/rosa take charcoal text; success/red take bone text). The
// neutral "approved = confirmed" fill is the inverted-neutral (foreground fill +
// background text), so it reads as a charcoal pill on the bone theme and a
// bone pill on the dark theme — matching the web "approved = charcoal pill" in
// light and the dark-shell flip in dark. Label text comes from the SHARED module
// so web and mobile read identically.
const TONE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-mustard", text: "text-charcoal" },
  waiting: { bg: "bg-mustard", text: "text-charcoal" },
  deposit_pending: { bg: "bg-rosa", text: "text-charcoal" },
  contacted: { bg: "bg-rosa", text: "text-charcoal" },
  approved: { bg: "bg-foreground", text: "text-background" },
  converted: { bg: "bg-success", text: "text-bone" },
  rejected: { bg: "bg-danger", text: "text-bone" },
  cancelled: { bg: "bg-shell-hover", text: "text-shell-dim" },
  dismissed: { bg: "bg-shell-hover", text: "text-shell-dim" },
};

const FALLBACK = { bg: "bg-shell-hover", text: "text-shell-dim" };

export function StatusPill({ status }: { status: string }) {
  const tone = TONE[status] ?? FALLBACK;
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${tone.bg}`}>
      <Text className={`text-xs font-semibold ${tone.text}`}>
        {humanStatusLabel(status)}
      </Text>
    </View>
  );
}
