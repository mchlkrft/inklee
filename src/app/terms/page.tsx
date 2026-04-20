import Link from "next/link";

export default function TermsPage() {
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
            terms of service
          </h1>
          <p className="text-xs">
            last updated: April 2026 · subject to change before public launch
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              1. service
            </h2>
            <p>
              inklee provides a booking request platform for tattoo artists. we
              are not a party to any booking agreement between artists and their
              customers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              2. accounts
            </h2>
            <p>
              artist accounts require a valid email address. you are responsible
              for keeping your login secure and for all activity under your
              account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              3. content
            </h2>
            <p>
              you retain ownership of content you upload (profile images,
              booking reference images). by uploading, you grant inklee a
              limited licence to store and display it for the purpose of
              operating the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              4. prohibited use
            </h2>
            <p>
              you may not use inklee for unlawful purposes, to spam, to scrape,
              or to interfere with the service or other users.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              5. availability
            </h2>
            <p>
              inklee is provided as-is. we make no guarantees of uptime or
              availability, particularly during the beta period.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              6. termination
            </h2>
            <p>
              we may suspend accounts that violate these terms. you may delete
              your account at any time by contacting hello@inklee.app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              7. contact
            </h2>
            <p>
              questions:{" "}
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
