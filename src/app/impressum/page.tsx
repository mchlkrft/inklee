import Link from "next/link";

export default function ImpressumPage() {
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
          <h1 className="text-2xl font-semibold text-foreground">impressum</h1>
          <p className="text-xs">angaben gemäß § 5 TMG</p>

          <section className="space-y-1">
            <p className="text-foreground font-medium">inklee app</p>
            <p>16/2 Nimmanahaeminda Road</p>
            <p>Tambon Su Thep, Amphoe Mueang Chiang Mai</p>
            <p>Chiang Mai 50200, Thailand</p>
          </section>

          <section className="space-y-1">
            <h2 className="text-base font-medium text-foreground">kontakt</h2>
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
              verantwortlich für den inhalt (§ 18 abs. 2 mstv)
            </h2>
            <p>inklee app, Adresse wie oben</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-foreground">
              haftungsausschluss
            </h2>
            <p>
              inklee ist eine technische Plattform zur Verwaltung von
              Buchungsanfragen. wir sind nicht Partei von Verträgen zwischen
              Tätowierern und ihren Kunden.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
