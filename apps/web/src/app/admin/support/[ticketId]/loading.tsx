/** Skeleton shaped like a support ticket thread: breadcrumb, title, message
 *  cards, and the reply box. */
export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <div className="space-y-2">
          <div className="h-3 w-40 rounded bg-muted animate-pulse" />
          <div className="h-8 w-72 rounded-md bg-muted animate-pulse" />
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-md border border-border p-4 space-y-2"
          >
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />
            <div
              className="h-3.5 rounded bg-muted animate-pulse"
              style={{ width: `${88 - index * 14}%` }}
            />
            <div
              className="h-3.5 rounded bg-muted animate-pulse"
              style={{ width: `${64 - index * 9}%` }}
            />
          </div>
        ))}
        <div className="h-28 rounded-md border border-border bg-muted/30 animate-pulse" />
      </div>
    </div>
  );
}
