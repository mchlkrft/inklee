const STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  approved: "bg-green-500/10 text-green-500",
  rejected: "bg-destructive/10 text-destructive",
  deposit_pending: "bg-amber-500/10 text-amber-500",
  cancelled: "bg-muted text-muted-foreground opacity-60",
};

const LABELS: Record<string, string> = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  deposit_pending: "deposit pending",
  cancelled: "cancelled",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
