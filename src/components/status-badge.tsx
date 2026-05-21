import { humanStatusLabel } from "@/lib/status-labels";

// All statuses use the same shape: a soft pastel tint of a brand color
// behind charcoal text. Neutral statuses (pending, waiting, cancelled,
// dismissed) use the workspace card-2 surface so they sit quietly in lists.

const STYLES: Record<string, string> = {
  // Booking statuses
  pending:
    "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)]",
  approved: "bg-[color:var(--color-tint-green)] text-brand-charcoal",
  rejected: "bg-[color:var(--color-tint-red)] text-brand-charcoal",
  deposit_pending: "bg-[color:var(--color-tint-mustard)] text-brand-charcoal",
  cancelled:
    "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)] opacity-70",
  // Waitlist statuses
  waiting:
    "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)]",
  contacted: "bg-[color:var(--color-tint-rosa)] text-brand-charcoal",
  converted: "bg-[color:var(--color-tint-cobalt)] text-brand-charcoal",
  dismissed:
    "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)] opacity-70",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status] ?? "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)]"}`}
    >
      {humanStatusLabel(status)}
    </span>
  );
}
