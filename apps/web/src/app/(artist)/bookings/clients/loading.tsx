export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="h-8 w-24 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
      </div>
      <div className="rounded-md border border-border divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center px-4 py-3 gap-4">
            <div className="flex-1 space-y-1">
              <div className="h-4 w-28 rounded bg-muted animate-pulse" />
              <div className="h-3 w-40 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-4 w-16 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded-full bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
