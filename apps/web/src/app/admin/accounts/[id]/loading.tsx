/** Skeleton shaped like the account detail page: breadcrumb, title, overview
 *  rows, stat cards, and the controls column. */
export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <div className="space-y-2">
          <div className="h-3 w-32 rounded bg-muted animate-pulse" />
          <div className="h-8 w-64 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-md border border-border p-5 space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex justify-between gap-6">
                  <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
                  <div className="h-3.5 w-44 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-md border border-border p-4 space-y-2"
                >
                  <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                  <div className="h-8 w-12 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
            <div className="rounded-md border border-border p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-3.5 rounded bg-muted animate-pulse"
                  style={{ width: `${92 - index * 9}%` }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-md border border-border p-5 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-8 rounded-full bg-muted animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
