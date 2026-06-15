export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-10">
        <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-md border border-border p-4 space-y-2"
            >
              <div className="h-3 w-20 rounded bg-muted animate-pulse" />
              <div className="h-8 w-12 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
        <div className="rounded-md border border-border p-5 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-4 w-40 rounded bg-muted animate-pulse" />
              <div
                className="h-2 rounded-full bg-muted animate-pulse"
                style={{ width: `${90 - i * 12}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
