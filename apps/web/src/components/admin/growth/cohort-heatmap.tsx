import type { CohortRow } from "@/lib/growth/retention";
import { RETENTION_CHECKPOINTS } from "@/lib/growth/retention";

/**
 * Cohort retention heatmap (CSS grid). Bucket classes are spelled out as
 * literals: Tailwind's JIT does NOT compile dynamic strings like
 * bg-brand-mustard/${n} (documented trap in (artist)/analytics). Dark-safe:
 * cell text uses semantic tokens, backgrounds are mustard opacities.
 * Null cells (checkpoint window still in the future) render as dashes, never
 * as zero.
 */
function bucketClass(pct: number | null): string {
  if (pct === null) return "bg-transparent";
  if (pct >= 75) return "bg-brand-mustard/90 text-brand-charcoal";
  if (pct >= 50) return "bg-brand-mustard/60 text-brand-charcoal";
  if (pct >= 25) return "bg-brand-mustard/35";
  if (pct > 0) return "bg-brand-mustard/15";
  return "bg-muted";
}

export function CohortHeatmap({
  cohorts,
  caption,
}: {
  cohorts: CohortRow[];
  caption?: string;
}) {
  if (cohorts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No cohorts in this window yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">Cohort</th>
            <th className="px-2 py-1 text-right font-medium">Artists</th>
            {RETENTION_CHECKPOINTS.map((checkpoint) => (
              <th
                key={checkpoint}
                className="px-2 py-1 text-center font-medium"
              >
                Day {checkpoint}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.cohort}>
              <td className="px-2 py-1 whitespace-nowrap text-foreground">
                {cohort.cohort}
              </td>
              <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                {cohort.size}
              </td>
              {cohort.cells.map((cell) => (
                <td
                  key={cell.checkpoint}
                  className={`rounded px-2 py-1 text-center tabular-nums ${bucketClass(cell.pct)}`}
                  title={
                    cell.pct === null
                      ? "Not measurable (window not elapsed or outside the activity lookback)"
                      : `${cell.retained} of ${cell.measurable} measurable active in the 7 days from day ${cell.checkpoint}`
                  }
                >
                  {cell.pct === null ? "–" : `${cell.pct}%`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption && (
        <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
      )}
    </div>
  );
}
