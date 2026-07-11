import type { FunnelStage } from "@/lib/growth/metrics";

/**
 * Horizontal funnel bars (CSS only, matches the /admin funnel idiom).
 * Server-safe.
 */
export function FunnelBars({ stages }: { stages: FunnelStage[] }) {
  const top = stages[0]?.count ?? 0;
  return (
    <div className="space-y-3">
      {stages.map((stage, index) => {
        const widthPct = top > 0 ? Math.max(2, (stage.count / top) * 100) : 2;
        const previous = index > 0 ? stages[index - 1].count : null;
        const stepPct =
          previous !== null && previous > 0
            ? Math.round((stage.count / previous) * 100)
            : null;
        return (
          <div key={stage.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-foreground">{stage.label}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {stage.count}
                {stepPct !== null && index > 0 && (
                  <span className="ml-2">{stepPct}% of previous</span>
                )}
              </p>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-brand-mustard"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
