export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 rounded-md bg-muted animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-md border border-border p-5 space-y-3"
          >
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-8 w-12 rounded bg-muted animate-pulse" />
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
