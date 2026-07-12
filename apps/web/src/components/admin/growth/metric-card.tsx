import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Compact metric card for the Growth cockpit. Server-safe (no state).
 * Deltas use brand tokens (green up, red down); a null delta renders nothing
 * rather than a misleading zero.
 */
export function MetricCard({
  label,
  value,
  sub,
  deltaPct,
  deltaInverted = false,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string | null;
  /** Percent change vs the previous period; null hides the delta. */
  deltaPct?: number | null;
  /** For metrics where DOWN is good (e.g. failures). */
  deltaInverted?: boolean;
  className?: string;
}) {
  const good =
    deltaPct !== null && deltaPct !== undefined
      ? deltaInverted
        ? deltaPct <= 0
        : deltaPct >= 0
      : null;
  return (
    <div className={cn("rounded-md border border-border p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <div className="mt-0.5 flex items-baseline gap-2">
        {deltaPct !== null && deltaPct !== undefined && (
          <span
            className={cn(
              "text-xs tabular-nums",
              good ? "text-brand-green" : "text-brand-red",
            )}
          >
            {deltaPct >= 0 ? `+${deltaPct}%` : `${deltaPct}%`}
          </span>
        )}
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

/**
 * Clickable stat tile that drills into a filtered view. One element order
 * everywhere (label, value, detail) so drill tiles read like MetricCards;
 * without an href it renders the same tile without the hover affordance.
 */
export function DrillTile({
  label,
  value,
  detail,
  href,
  className,
}: {
  label: string;
  value: string | number;
  detail?: string | null;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "block rounded-md border border-border p-4 transition-colors hover:bg-muted/30",
          className,
        )}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className={cn("rounded-md border border-border p-4", className)}>
      {body}
    </div>
  );
}

/** Uppercase section heading used across cockpit pages. */
export function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** Inline notice for metrics resting on too few data points. */
export function SampleWarning({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="rounded-md border border-brand-mustard/40 bg-brand-mustard/10 px-3 py-2 text-xs text-muted-foreground">
      {text}
    </p>
  );
}

/** Standard empty/insufficient-data state. */
export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
