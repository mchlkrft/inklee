import { cn } from "@/lib/utils";

/**
 * Loading placeholders shaped like the cockpit's table-heavy pages
 * (Acquisition and Search groups), so the skeleton matches what actually
 * renders instead of the card-and-funnel shape of the product tabs.
 */

/** Row of pill placeholders standing in for a sub-nav or the range picker. */
export function PillRowSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-7 w-20 rounded-full bg-muted animate-pulse"
        />
      ))}
    </div>
  );
}

/** Grid of stat-card placeholders matching the MetricCard grid. */
export function MetricGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-md border border-border p-4 space-y-2"
        >
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          <div className="h-8 w-14 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/** Bordered table placeholder: a header row plus data rows with numeric
 *  columns right-aligned, mirroring the shared cockpit table idiom. */
export function TableSkeleton({
  rows = 8,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center justify-between gap-6 px-3 py-2.5">
        <div className="h-3 w-32 rounded bg-muted animate-pulse" />
        <div className="flex gap-6">
          {Array.from({ length: columns - 1 }).map((_, index) => (
            <div
              key={index}
              className="hidden h-3 w-14 rounded bg-muted animate-pulse sm:block"
            />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center justify-between gap-6 border-t border-border px-3 py-3"
        >
          <div
            className="h-3.5 rounded bg-muted animate-pulse"
            style={{ width: `${11 + ((rowIndex * 7) % 9)}rem` }}
          />
          <div className="flex gap-6">
            {Array.from({ length: columns - 1 }).map((_, colIndex) => (
              <div
                key={colIndex}
                className="hidden h-3.5 w-10 rounded bg-muted animate-pulse sm:block"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
