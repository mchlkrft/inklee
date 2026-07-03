import { SUPPORT_STATUS_LABELS, type SupportStatus } from "@/lib/support";

// Follows the platform StatusBadge rule: status chips use SOLID brand fills,
// not soft tints, with the booking-status semantics from the artist's view:
//   awaiting_artist  → mustard  (your turn)
//   open / awaiting_support → rosa (waiting on the Inklee team)
//   resolved         → green    (done)
//   closed           → muted    (archived, sits quietly)
const CHIP_CLASSES: Record<SupportStatus, string> = {
  open: "bg-brand-rosa text-brand-charcoal",
  awaiting_support: "bg-brand-rosa text-brand-charcoal",
  awaiting_artist: "bg-brand-mustard text-brand-charcoal",
  resolved: "bg-brand-green text-brand-bone",
  closed: "bg-brand-charcoal/10 text-brand-charcoal",
};

export default function SupportStatusChip({
  status,
}: {
  status: SupportStatus;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP_CLASSES[status]}`}
    >
      {SUPPORT_STATUS_LABELS[status]}
    </span>
  );
}
