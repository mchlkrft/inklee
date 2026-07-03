import { SUPPORT_STATUS_LABELS, type SupportStatus } from "@/lib/support";

// Status chips carry a text label (never color alone). Muted for terminal
// states, mustard-tinted when the ball is in Inklee's court, plain bordered
// when the artist should act.
const CHIP_CLASSES: Record<SupportStatus, string> = {
  open: "border-brand-mustard/50 bg-brand-mustard/10 text-foreground",
  awaiting_support:
    "border-brand-mustard/50 bg-brand-mustard/10 text-foreground",
  awaiting_artist: "border-border bg-transparent text-foreground",
  resolved: "border-border bg-muted/40 text-muted-foreground",
  closed: "border-border bg-muted/40 text-muted-foreground",
};

export default function SupportStatusChip({
  status,
}: {
  status: SupportStatus;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${CHIP_CLASSES[status]}`}
    >
      {SUPPORT_STATUS_LABELS[status]}
    </span>
  );
}
