export default function BooksClosedBlock({
  message = "Books are currently closed.",
  hint,
  children,
}: {
  message?: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border px-5 py-8 text-center">
      <div className="space-y-1">
        <p className="text-sm text-foreground">{message}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
