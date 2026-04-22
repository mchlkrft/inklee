import Link from "next/link";

export default function ImpressumPage() {
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
          <h1 className="text-2xl font-semibold text-foreground">Impressum</h1>
          <p className="text-xs">Angaben gemaess § 5 TMG</p>

          <section className="space-y-1">
            <p className="font-medium text-foreground">inklee app</p>
            <p>16/2 Nimmanahaeminda Road</p>
            <p>Tambon Su Thep, Amphoe Mueang Chiang Mai</p>
            <p>Chiang Mai 50200, Thailand</p>
          </section>

          <section className="space-y-1">
            <h2 className="text-base font-medium text-foreground">Kontakt</h2>
            <p>
              E-Mail:{" "}
              <a
                href="mailto:hello@inklee.app"
                className="text-foreground underline underline-offset-4"
              >
                hello@inklee.app
              </a>
            </p>
          </section>

          <section className="space-y-1">
            <h2 className="text-base font-medium text-foreground">
              Verantwortlich fuer den Inhalt (§ 18 Abs. 2 MStV)
            </h2>
            <p>inklee app, Adresse wie oben</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              Haftungsausschluss
            </h2>
            <p>
              inklee ist eine technische Plattform zur Verwaltung von
              Buchungsanfragen. Wir sind nicht Partei von Vertraegen zwischen
              Taetowierern und ihren Kunden.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
