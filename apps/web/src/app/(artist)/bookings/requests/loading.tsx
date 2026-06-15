export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-32 rounded-md bg-muted animate-pulse" />
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-20 rounded-full bg-muted animate-pulse"
          />
        ))}
      </div>
      <div className="rounded-md border border-border overflow-hidden">
        <div className="h-10 bg-muted/30 border-b border-border" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0"
          >
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-32 rounded bg-muted animate-pulse flex-1" />
            <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-16 rounded bg-muted animate-pulse hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
