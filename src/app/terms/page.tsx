import Link from "next/link";

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="text-xs">Last updated: May 2026</p>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              1. Service
            </h2>
            <p>
              Inklee is operated by Inklee OÜ (Pärnu mnt. 105, 11312 Tallinn,
              Estonia). The platform provides booking request management for
              tattoo artists. Inklee OÜ is not a party to any booking agreement
              between an artist and their client.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              2. Accounts
            </h2>
            <p>
              Artist accounts require a valid email address. You are responsible
              for keeping your login secure and for all activity under your
              account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              3. Content
            </h2>
            <p>
              You retain ownership of content you upload (profile images,
              booking reference images). By uploading, you grant inklee a
              limited licence to store and display it for the purpose of
              operating the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              4. Prohibited use
            </h2>
            <p>
              You may not use inklee for unlawful purposes, to spam, to scrape,
              or to interfere with the service or other users.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              5. Availability
            </h2>
            <p>
              inklee is provided as-is. We make no guarantees of uptime or
              availability, particularly during the beta period.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              6. Termination
            </h2>
            <p>
              We may suspend accounts that violate these terms. You may delete
              your account at any time by contacting hello@inklee.app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              7. Contact
            </h2>
            <p>
              Questions:{" "}
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
