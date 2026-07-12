/** Skeleton shaped like the support inbox: breadcrumb, title, filter row,
 *  then the ticket table. */
export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-muted animate-pulse" />
          <div className="h-8 w-52 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-8 w-32 rounded-md bg-muted animate-pulse"
            />
          ))}
        </div>
        <div className="overflow-hidden rounded-md border border-border">
          <div className="flex items-center justify-between gap-6 px-3 py-2.5">
            <div className="h-3 w-40 rounded bg-muted animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          </div>
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-6 border-t border-border px-3 py-3"
            >
              <div
                className="h-3.5 rounded bg-muted animate-pulse"
                style={{ width: `${13 + ((index * 5) % 8)}rem` }}
              />
              <div className="h-3.5 w-20 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
