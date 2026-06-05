export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-28 rounded-md bg-muted animate-pulse" />
        <div className="h-8 w-32 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-7 gap-px rounded-md border border-border overflow-hidden bg-border">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-8 bg-muted/30 flex items-center justify-center"
          >
            <div className="h-3 w-6 rounded bg-muted animate-pulse" />
          </div>
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-20 bg-background p-1 space-y-1">
            <div className="h-3 w-5 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
