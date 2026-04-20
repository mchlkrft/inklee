import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-12 space-y-8">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          inklee
        </Link>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <h1 className="text-2xl font-semibold text-foreground">
            privacy policy
          </h1>
          <p className="text-xs">
            last updated: April 2026 · subject to review by a lawyer before
            public launch
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              data we collect
            </h2>
            <p>
              <strong className="text-foreground">Artists:</strong> email
              address, display name, instagram handle, bio, location, timezone,
              logo image, booking preferences.
            </p>
            <p>
              <strong className="text-foreground">
                Customers (via booking form):
              </strong>{" "}
              instagram handle, email address, tattoo description, reference
              images, preferred date or slot. customers do not create accounts.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              how we use it
            </h2>
            <p>
              to operate the booking service: authenticate artists, route
              booking requests, send transactional emails, and maintain an audit
              log of booking status changes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              subprocessors
            </h2>
            <ul className="space-y-1 list-disc list-inside">
              <li>
                <strong className="text-foreground">Supabase</strong>{" "}
                (EU/Frankfurt) — database, authentication, file storage.{" "}
                <a
                  href="https://supabase.com/privacy"
                  className="underline underline-offset-4"
                >
                  DPA available
                </a>
                .
              </li>
              <li>
                <strong className="text-foreground">Vercel</strong> (EU region)
                — application hosting.{" "}
                <a
                  href="https://vercel.com/legal/dpa"
                  className="underline underline-offset-4"
                >
                  DPA available
                </a>
                .
              </li>
              <li>
                <strong className="text-foreground">Resend</strong> (EU) —
                transactional email delivery.
              </li>
              <li>
                <strong className="text-foreground">Plausible</strong> —
                privacy-friendly analytics. No cookies. No personal data
                collected.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">cookies</h2>
            <p>
              inklee uses strictly necessary cookies only — specifically,
              session cookies required for artist authentication (Supabase
              auth). no tracking cookies, no third-party advertising cookies.
              plausible analytics is cookie-free.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">retention</h2>
            <p>
              rejected and cancelled booking images are deleted after 30 days.
              booking records are retained until an artist deletes their
              account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              your rights (GDPR)
            </h2>
            <p>
              you have the right to access, correct, and delete your data. to
              exercise these rights, email{" "}
              <a
                href="mailto:hello@inklee.app"
                className="text-foreground underline underline-offset-4"
              >
                hello@inklee.app
              </a>
              . we will respond within 30 days.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">contact</h2>
            <p>
              <a
                href="mailto:hello@inklee.app"
                className="text-foreground underline underline-offset-4"
              >
                hello@inklee.app
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
