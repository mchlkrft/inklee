export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="h-7 w-72 rounded-full bg-muted animate-pulse" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="rounded-md border border-border p-4 space-y-2"
          >
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            <div className="h-8 w-14 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
      <div className="rounded-md border border-border p-5 space-y-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-1.5">
            <div className="h-4 w-44 rounded bg-muted animate-pulse" />
            <div
              className="h-2 rounded-full bg-muted animate-pulse"
              style={{ width: `${92 - index * 13}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
