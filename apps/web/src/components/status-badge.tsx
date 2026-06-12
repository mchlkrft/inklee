import { humanStatusLabel } from "@/lib/status-labels";

// Status is the single most important signal on the platform, so chips use
// SOLID brand fills (not soft tints) for high visibility on the bone workspace.
// Active states read loud; terminal-negative states read quiet.
//   pending          → mustard  (needs your decision)
//   awaiting deposit → rosa     (waiting on the client to pay)
//   accepted         → charcoal (confirmed)
//   passed           → red      (declined)
//   cancelled        → muted    (archived, sits quietly)

const STYLES: Record<string, string> = {
  // Booking statuses
  pending: "bg-brand-mustard text-brand-charcoal",
  deposit_pending: "bg-brand-rosa text-brand-charcoal",
  approved: "bg-brand-charcoal text-brand-bone",
  rejected: "bg-brand-red text-brand-bone",
  cancelled: "bg-brand-charcoal/10 text-brand-charcoal",
  // Waitlist statuses
  waiting: "bg-brand-mustard text-brand-charcoal",
  contacted: "bg-brand-rosa text-brand-charcoal",
  converted: "bg-brand-green text-brand-bone",
  dismissed: "bg-brand-charcoal/10 text-brand-charcoal",
  // Slot statuses (label via slotStatusLabel — pass the `label` prop)
  open: "bg-brand-green text-brand-bone",
  locked: "bg-brand-rosa text-brand-charcoal",
  booked: "bg-brand-charcoal text-brand-bone",
};

const FALLBACK = "bg-brand-charcoal/10 text-brand-charcoal";

export default function StatusBadge({
  status,
  label,
}: {
  status: string;
  /** Override for status families humanStatusLabel doesn't cover (slots). */
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] ?? FALLBACK}`}
    >
      {label ?? humanStatusLabel(status)}
    </span>
  );
}
