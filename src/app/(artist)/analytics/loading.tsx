export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="h-8 w-28 rounded-md bg-muted animate-pulse" />
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-7 w-24 rounded-full bg-muted animate-pulse"
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-md border border-border p-4 space-y-2"
          >
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            <div className="h-8 w-16 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-4 w-36 rounded bg-muted animate-pulse" />
        <div className="flex items-end gap-2 h-32">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-muted animate-pulse"
              style={{ height: `${i * 15}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
