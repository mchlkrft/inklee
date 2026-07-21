import Link from "next/link";
import { apexHref } from "@/lib/public-url";

export default async function NotFound() {
  // This page also renders for unmatched paths on artist subdomains, where
  // a relative "/" would resolve back to the artist page, not Inklee. The
  // label says "Back to Inklee", so the href must be host-aware.
  const homeHref = await apexHref("/");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center space-y-4">
        <p className="text-xs text-muted-foreground font-mono">404</p>
        <h1 className="text-xl font-semibold text-foreground">
          Page not found
        </h1>
        <p className="text-sm text-muted-foreground">
          This page doesn&apos;t exist or was moved.
        </p>
        <Link
          href={homeHref}
          className="inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        >
          Back to Inklee
        </Link>
      </div>
    </div>
  );
}
