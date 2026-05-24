import Link from "next/link";

interface BooksStatusPillProps {
  open: boolean;
  remaining?: number | null;
  windowEndDate?: string | null;
  /** Compact mode drops the "Books " prefix and the trailing detail so the
   *  pill fits in the mobile top bar next to the notification bell + menu. */
  compact?: boolean;
}

export default function BooksStatusPill({
  open,
  remaining,
  windowEndDate,
  compact = false,
}: BooksStatusPillProps) {
  const fullLabel = open ? "Books open" : "Books closed";
  const shortLabel = open ? "Open" : "Closed";
  const label = compact ? shortLabel : fullLabel;
  const detail =
    !compact && open && typeof remaining === "number" && remaining >= 0
      ? `· ${remaining} left`
      : !compact && open && windowEndDate
        ? "· until window"
        : null;

  return (
    <Link
      href="/bookings/settings"
      aria-label={`${fullLabel}${detail ?? ""} — manage availability`}
      className={`group inline-flex items-center gap-2 rounded-full border border-[color:var(--color-workspace-border)] bg-[color:var(--color-workspace-card)] ${
        compact ? "px-2.5 py-1" : "px-3 py-1.5"
      } text-xs font-medium text-[color:var(--color-workspace-fg)] transition-colors hover:border-transparent hover:bg-brand-charcoal hover:text-brand-bone focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-rosa/40`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          open
            ? "bg-brand-green"
            : "bg-[color:var(--color-workspace-fg-dim)] group-hover:bg-[color:var(--color-shell-fg-mute)]"
        }`}
      />
      <span>{label}</span>
      {detail && (
        <span className="text-[color:var(--color-workspace-fg-dim)] group-hover:text-[color:var(--color-shell-fg-dim)]">
          {detail}
        </span>
      )}
    </Link>
  );
}
