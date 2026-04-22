import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex-1 w-full max-w-2xl space-y-8 px-6 py-12">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          inklee
        </Link>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <h1 className="text-2xl font-semibold text-foreground">
            Privacy Policy
          </h1>
          <p className="text-xs">
            Last updated: April 2026 - subject to review by a lawyer before
            public launch
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              Data we collect
            </h2>
            <p>
              <strong className="text-foreground">Artists:</strong> email
              address, display name, Instagram handle, bio, location, timezone,
              logo image, booking preferences.
            </p>
            <p>
              <strong className="text-foreground">
                Customers (via booking form):
              </strong>{" "}
              Instagram handle, email address, tattoo description, reference
              images, preferred date or slot. Customers do not create accounts.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              How we use it
            </h2>
            <p>
              To operate the booking service: authenticate artists, route
              booking requests, send transactional emails, and maintain an audit
              log of booking status changes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              Subprocessors
            </h2>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong className="text-foreground">Supabase</strong>{" "}
                (EU/Frankfurt) - database, authentication, file storage.{" "}
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
                - application hosting.{" "}
                <a
                  href="https://vercel.com/legal/dpa"
                  className="underline underline-offset-4"
                >
                  DPA available
                </a>
                .
              </li>
              <li>
                <strong className="text-foreground">Resend</strong> (EU) -
                transactional email delivery.
              </li>
              <li>
                <strong className="text-foreground">Plausible</strong> -
                privacy-friendly analytics. No cookies. No personal data
                collected.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">Cookies</h2>
            <p>
              inklee uses strictly necessary cookies only - specifically,
              session cookies required for artist authentication (Supabase
              Auth). No tracking cookies, no third-party advertising cookies.
              Plausible analytics is cookie-free.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">Retention</h2>
            <p>
              Rejected and cancelled booking images are deleted after 30 days.
              Booking records are retained until an artist deletes their
              account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              Your rights (GDPR)
            </h2>
            <p>
              You have the right to access, correct, and delete your data. To
              exercise these rights, email{" "}
              <a
                href="mailto:hello@inklee.app"
                className="text-foreground underline underline-offset-4"
              >
                hello@inklee.app
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">Contact</h2>
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
