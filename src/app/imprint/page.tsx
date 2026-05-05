import Link from "next/link";

export const metadata = {
  title: "Imprint",
  description: "Legal notice for Inklee OÜ.",
};

export default function ImprintPage() {
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
          <h1 className="text-2xl font-semibold text-foreground">Imprint</h1>
          <p className="text-xs">Legal notice / company information</p>

          <section className="space-y-1">
            <h2 className="text-base font-medium text-foreground">Operator</h2>
            <p className="text-foreground">Inklee OÜ</p>
            <p>Pärnu mnt. 105</p>
            <p>11312 Tallinn</p>
            <p>Estonia</p>
          </section>

          <section className="space-y-1">
            <h2 className="text-base font-medium text-foreground">
              Registration
            </h2>
            <p>Registry code: 17497625</p>
          </section>

          <section className="space-y-1">
            <h2 className="text-base font-medium text-foreground">Contact</h2>
            <p>
              E-mail:{" "}
              <a
                href="mailto:support@inklee.app"
                className="text-foreground underline underline-offset-4"
              >
                support@inklee.app
              </a>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              Service description
            </h2>
            <p>
              Inklee is a booking-management platform for tattoo artists. We are
              not a party to any agreement between an artist and their client.
              Bookings, deposits, and tattoo appointments are arranged directly
              between artists and their clients.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              Online dispute resolution
            </h2>
            <p>
              The European Commission provides a platform for online dispute
              resolution at{" "}
              <a
                href="https://ec.europa.eu/consumers/odr"
                className="underline underline-offset-4"
                target="_blank"
                rel="noopener noreferrer"
              >
                ec.europa.eu/consumers/odr
              </a>
              . We are not obliged and not willing to participate in dispute
              resolution proceedings before a consumer arbitration board.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
