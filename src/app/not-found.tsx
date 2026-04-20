import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center space-y-4">
        <p className="text-xs text-muted-foreground font-mono">404</p>
        <h1 className="text-xl font-semibold text-foreground">
          page not found
        </h1>
        <p className="text-sm text-muted-foreground">
          this page doesn&apos;t exist or was moved.
        </p>
        <Link
          href="/"
          className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        >
          back to inklee
        </Link>
      </div>
    </div>
  );
}
