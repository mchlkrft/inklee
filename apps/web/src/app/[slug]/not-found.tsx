import { headers } from "next/headers";
import Link from "next/link";

/** Custom not-found for the /[slug] route family.
 *
 *  Two render modes, chosen by the `x-host-routing` header that the
 *  middleware sets on artist-subdomain requests:
 *
 *  - "subdomain" mode: the visitor arrived via `name.inkl.ee` but no
 *    profile exists for `name`. Show a friendly "this name is still
 *    available — claim it" message that doubles as a soft conversion
 *    into the signup flow with the slug pre-stashed.
 *
 *  - default mode: the visitor reached the apex `inklee.app/<name>`
 *    path directly. Show a neutral 404 — they were likely sharing or
 *    typing a URL they expected to work.
 *
 *  The slug is read from the `x-artist-slug` header rather than from
 *  route params because Next.js does not pass params into not-found.tsx
 *  reliably (the param is undefined when notFound() is triggered from
 *  generateMetadata). The header is set by the middleware on every
 *  artist-subdomain rewrite, so it is always present in subdomain
 *  mode. In apex mode the header is absent and we fall through. */
export default async function ArtistNotFound() {
  const h = await headers();
  const isSubdomain = h.get("x-host-routing") === "subdomain";
  const attemptedSlug = h.get("x-artist-slug") ?? "";

  if (isSubdomain && attemptedSlug) {
    return <SubdomainClaimPage slug={attemptedSlug} />;
  }

  return <ApexNotFound />;
}

function SubdomainClaimPage({ slug }: { slug: string }) {
  // Pre-fill the slug into the same localStorage key the /start page
  // uses, so clicking "Claim this name" jumps straight to signup with
  // the right intent. Inline script runs before React hydration —
  // even an immediate Link click carries the intent.
  const stashScript = `try{localStorage.setItem("inklee_intended_slug",${JSON.stringify(slug)})}catch(e){}`;

  return (
    <div className="flex min-h-screen flex-col bg-brand-charcoal text-brand-bone">
      <script dangerouslySetInnerHTML={{ __html: stashScript }} />
      <main className="container-marketing flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-brand-bone/60">
          inkl.ee/{slug}
        </p>
        <h1 className="mt-6 text-4xl font-bold sm:text-5xl">
          This name is still <span className="text-brand-mustard">free</span>.
        </h1>
        <p className="mt-6 max-w-md text-base text-brand-bone/80">
          No artist has claimed{" "}
          <span className="font-mono text-brand-bone">inkl.ee/{slug}</span> yet.
          Make it yours. Set up your booking link in under two minutes.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="https://inklee.app/signup"
            className="rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal shadow-shell transition-opacity hover:opacity-90"
          >
            Claim {slug}
          </Link>
          <Link
            href="https://inklee.app"
            className="rounded-full border-[1.5px] border-brand-bone/30 px-6 py-3 text-base font-medium text-brand-bone transition-colors hover:bg-brand-bone/5"
          >
            What is Inklee?
          </Link>
        </div>
      </main>
    </div>
  );
}

function ApexNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="space-y-4 text-center">
        <p className="font-mono text-xs text-muted-foreground">404</p>
        <h1 className="text-xl font-semibold text-foreground">
          Artist not found
        </h1>
        <p className="text-sm text-muted-foreground">
          This Inklee booking link does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        >
          Back to Inklee
        </Link>
      </div>
    </div>
  );
}
