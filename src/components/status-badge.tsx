const STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  approved: "bg-green-500/10 text-green-500",
  rejected: "bg-brand-red/10 text-brand-red",
  deposit_pending: "bg-brand-mustard/15 text-brand-mustard",
  cancelled: "bg-muted text-muted-foreground opacity-60",
  // waitlist
  waiting: "bg-muted text-muted-foreground",
  contacted: "bg-brand-rosa/15 text-brand-rosa",
  converted: "bg-brand-cobalt/15 text-brand-cobalt",
  dismissed: "bg-muted text-muted-foreground opacity-60",
};

const LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  deposit_pending: "Deposit pending",
  cancelled: "Cancelled",
  waiting: "Waiting",
  contacted: "Contacted",
  converted: "Waitlist Request",
  dismissed: "Dismissed",
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
