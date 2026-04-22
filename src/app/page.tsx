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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <span className="text-base font-semibold tracking-tight text-foreground">
          inklee
        </span>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Get started free
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 pb-20 pt-24 text-center">
          <h1 className="text-5xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
            Booking requests
            <br />
            without the DM chaos
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Replace scattered Instagram messages with a structured booking form,
            approval flow, and deposit collection — built for freelance and
            traveling tattoo artists.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="w-full rounded-md bg-foreground px-8 py-3 text-center text-sm font-medium text-background sm:w-auto"
            >
              Get started free
            </Link>
            <Link
              href="/ouchy"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full rounded-md border border-border px-8 py-3 text-center text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground sm:w-auto"
            >
              See a live example →
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <Feature
              title="Structured booking form"
              description="Clients submit placement, size, description, and reference images — no back-and-forth to gather the basics."
            />
            <Feature
              title="Request management"
              description="Review, approve, reject, or request a deposit from a clean dashboard. Every decision is logged."
            />
            <Feature
              title="Deposit collection"
              description="Request deposits via Stripe. Clients pay directly from their magic link — no payment details stored on your side."
            />
            <Feature
              title="Waitlist"
              description="When books are closed, clients can join a waitlist. Open a new round and convert waitlist entries into bookings."
            />
            <Feature
              title="Travel mode"
              description="Running a guest spot? Publish travel legs and clients see your city and dates on your booking page automatically."
            />
            <Feature
              title="Calendar + iCal"
              description="Approved bookings appear on a calendar view. Export to Google Calendar, Apple Calendar, or any iCal app."
            />
          </div>
        </section>

        <section className="border-t border-border px-6 py-20">
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-8 md:grid-cols-2">
            <Quote
              text="Finally a tool that handles the boring parts — I just focus on the tattooing."
              author="Tattoo artist, Berlin"
            />
            <Quote
              text="My clients love it. They fill in the form and I get everything I need in one place."
              author="Freelance artist, Amsterdam"
            />
          </div>
        </section>

        <section className="px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold text-foreground">
            Your booking link in under 5 minutes
          </h2>
          <p className="mt-3 text-muted-foreground">
            No credit card required — free to get started.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-md bg-foreground px-8 py-3 text-sm font-medium text-background"
          >
            Create your booking page
          </Link>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-xs text-muted-foreground sm:flex-row">
          <span className="font-medium text-foreground">inklee</span>
          <div className="flex gap-5">
            <Link
              href="/terms"
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/impressum"
              className="transition-colors hover:text-foreground"
            >
              Impressum
            </Link>
            <Link
              href="/help"
              className="transition-colors hover:text-foreground"
            >
              Help
            </Link>
            <Link
              href="/about"
              className="transition-colors hover:text-foreground"
            >
              About
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
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function Quote({ text, author }: { text: string; author: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-foreground">
        &ldquo;{text}&rdquo;
      </p>
      <p className="text-xs text-muted-foreground">— {author}</p>
    </div>
  );
}
