import Link from "next/link";

interface BooksStatusPillProps {
  open: boolean;
  remaining?: number | null;
  windowEndDate?: string | null;
}

export default function BooksStatusPill({
  open,
  remaining,
  windowEndDate,
}: BooksStatusPillProps) {
  const label = open ? "Books open" : "Books closed";
  const detail =
    open && typeof remaining === "number" && remaining >= 0
      ? `· ${remaining} left`
      : open && windowEndDate
        ? "· until window"
        : null;

  return (
    <Link
      href="/bookings/settings"
      aria-label={`${label}${detail ?? ""} — manage availability`}
      className="group inline-flex items-center gap-2 rounded-full border border-[color:var(--color-workspace-border)] bg-[color:var(--color-workspace-card)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-workspace-fg)] transition-colors hover:border-transparent hover:bg-brand-charcoal hover:text-brand-bone focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-rosa/40"
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
