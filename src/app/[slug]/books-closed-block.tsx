export default function BooksClosedBlock({
  message = "books are currently closed",
  hint,
  children,
}: {
  message?: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border px-5 py-8 text-center space-y-3">
      <div className="space-y-1">
        <p className="text-sm text-foreground">{message}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
