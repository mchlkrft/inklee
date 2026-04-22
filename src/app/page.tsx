import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Nav */}
      <header className="px-6 py-4 flex items-center justify-between max-w-5xl mx-auto w-full">
        <span className="text-base font-semibold tracking-tight text-foreground">
          inklee
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            log in
          </Link>
          <Link
            href="/signup"
            className="text-sm rounded-md bg-foreground px-4 py-2 font-medium text-background"
          >
            get started free
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 pt-24 pb-20 text-center max-w-3xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-foreground leading-tight">
            booking requests
            <br />
            without the DM chaos
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            replace scattered Instagram messages with a structured booking form,
            approval flow, and deposit collection — built for freelance and
            traveling tattoo artists.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-foreground px-8 py-3 text-sm font-medium text-background w-full sm:w-auto text-center"
            >
              get started free
            </Link>
            <Link
              href="/ouchy"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-8 py-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors w-full sm:w-auto text-center"
            >
              see a live example ↗
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-20 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Feature
              title="structured booking form"
              description="clients submit placement, size, description, and reference images — no back-and-forth to gather the basics."
            />
            <Feature
              title="request management"
              description="review, approve, reject, or request a deposit from a clean dashboard. every decision is logged."
            />
            <Feature
              title="deposit collection"
              description="request deposits via Stripe. clients pay directly from their magic link — no payment details stored on your side."
            />
            <Feature
              title="waitlist"
              description="when books are closed, clients can join a waitlist. open a new round and convert waitlist entries into bookings."
            />
            <Feature
              title="travel mode"
              description="running a guest spot? publish travel legs and clients see your city and dates on your booking page automatically."
            />
            <Feature
              title="calendar + iCal"
              description="approved bookings appear on a calendar view. export to Google Calendar, Apple Calendar, or any iCal app."
            />
          </div>
        </section>

        {/* Social proof */}
        <section className="px-6 py-20 border-t border-border">
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            <Quote
              text="finally a tool that handles the boring parts — I just focus on the tattooing."
              author="tattoo artist, Berlin"
            />
            <Quote
              text="my clients love it. they fill in the form and I get everything I need in one place."
              author="freelance artist, Amsterdam"
            />
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold text-foreground">
            your booking link in under 5 minutes
          </h2>
          <p className="mt-3 text-muted-foreground">
            no credit card required — free to get started.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-md bg-foreground px-8 py-3 text-sm font-medium text-background"
          >
            create your booking page
          </Link>
        </section>
      </main>

      <footer className="px-6 py-8 border-t border-border">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">inklee</span>
          <div className="flex gap-5">
            <Link
              href="/terms"
              className="hover:text-foreground transition-colors"
            >
              terms
            </Link>
            <Link
              href="/privacy"
              className="hover:text-foreground transition-colors"
            >
              privacy
            </Link>
            <Link
              href="/impressum"
              className="hover:text-foreground transition-colors"
            >
              impressum
            </Link>
            <Link
              href="/help"
              className="hover:text-foreground transition-colors"
            >
              help
            </Link>
            <Link
              href="/about"
              className="hover:text-foreground transition-colors"
            >
              about
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function Quote({ text, author }: { text: string; author: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground leading-relaxed">
        &ldquo;{text}&rdquo;
      </p>
      <p className="text-xs text-muted-foreground">— {author}</p>
    </div>
  );
}
