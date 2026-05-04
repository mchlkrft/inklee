import type { Metadata } from "next";
import Link from "next/link";
import SiteLogo from "@/components/site-logo";

export const metadata: Metadata = {
  title: "Guest Spot Booking Tool · Inklee",
  description:
    "Tattoo guest spot booking without spreadsheet chaos. Manage city demand, travel dates, and requests as a traveling tattoo artist.",
  alternates: {
    canonical: "/guest-spots",
  },
  openGraph: {
    title: "Guest spot bookings without the chaos",
    description:
      "Inklee helps traveling tattoo artists organize guest spot requests, city demand, booking windows, and client details.",
    url: "https://inklee.app/guest-spots",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Guest spot bookings without the chaos",
    description:
      "Inklee helps traveling tattoo artists organize guest spot requests, city demand, booking windows, and client details.",
  },
};

/* ─── Shared CTA ──────────────────────────────────────────────────────────── */

function CtaPrimary({
  label = "Create your guest spot link",
}: {
  label?: string;
}) {
  return (
    <Link
      href="/signup"
      className="inline-block rounded-md bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
    >
      {label}
    </Link>
  );
}

/* ─── Header ─────────────────────────────────────────────────────────────── */

function LandingHeader() {
  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
      <Link href="/" aria-label="inklee home">
        <SiteLogo height={20} />
      </Link>
      <nav className="flex items-center gap-5">
        <Link
          href="/login"
          className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-md bg-foreground px-4 py-2 text-base font-bold text-background transition-opacity hover:opacity-85"
        >
          Get started free
        </Link>
      </nav>
    </header>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────────────── */

function HeroSection() {
  return (
    <section className="overflow-hidden">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[5fr_7fr] md:gap-0">
          {/* Text */}
          <div className="order-2 pb-16 pt-6 md:order-1 md:py-24 md:pr-10">
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
              Guest spot bookings
              <br />
              without the chaos
            </h1>
            <p className="mt-5 max-w-xs text-base leading-relaxed text-muted-foreground sm:text-lg">
              Collect structured tattoo requests for the right city and dates
              with one clean booking flow built for traveling artists.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaPrimary />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Made for artists moving between cities, studios, and booking
              waves.
            </p>
          </div>

          {/* Hero visual placeholder */}
          <div className="order-1 flex justify-center md:order-2 md:justify-end md:-mr-8 lg:-mr-16">
            <div className="w-full max-w-sm md:max-w-full">
              {/* PLACEHOLDER: hero visual — two-panel contrast composition showing scattered
                  guest spot DMs mixed across cities on the left, clean city/date-based
                  booking flow on the right. Suggested size: ~600×480px.
                  Replace this block with <img> or <Image> pointing to final asset. */}
              <div className="flex h-80 w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/10 md:h-[420px]">
                <div className="space-y-2 text-center px-6">
                  <p className="text-sm font-medium text-muted-foreground">
                    Hero visual placeholder
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Scattered city DMs → clean guest spot booking flow
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Pain section ────────────────────────────────────────────────────────── */

const PAIN_POINTS = [
  {
    id: "mixed",
    icon: "🌀",
    title: "Requests from different cities end up in the same DMs",
    body: "Berlin, Amsterdam, London — all mixed together. You spend time just figuring out who is asking about which trip.",
  },
  {
    id: "dates",
    icon: "📅",
    title: "Travel dates and booking windows get mixed up",
    body: "Clients ask about dates that have already passed, or city windows you haven't announced yet. Nothing lines up.",
  },
  {
    id: "backforth",
    icon: "🔁",
    title: "Too much back and forth before a spot is even booked",
    body: "Before anything is confirmed you have already answered the same questions five times across three different DM threads.",
  },
  {
    id: "volume",
    icon: "📈",
    title: "High booking volume makes everything harder to track",
    body: "The more cities you add, the more requests you get, and the harder it is to keep an overview of what is actually confirmed.",
  },
];

function PainSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 md:py-24">
      <div className="max-w-xl">
        <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
          Three cities, one inbox,
          <br />
          too much mess.
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          When you run guest spots, requests from different cities pile into the
          same DMs. Travel dates and client expectations get confused. You sort
          it all manually. The admin starts stacking up before the trip even
          begins.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PAIN_POINTS.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-border bg-card px-5 py-5 space-y-2"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl leading-none" aria-hidden="true">
                {p.icon}
              </span>
              <p className="text-sm font-semibold text-foreground">{p.title}</p>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Solution section ────────────────────────────────────────────────────── */

const SOLUTION_STEPS = [
  {
    n: "1",
    title: "Share your guest spot booking link",
    body: "One link in bio. Clients know exactly where to send their request.",
  },
  {
    n: "2",
    title: "They send a request for the right city and dates",
    body: "Size, placement, description, references — and the location they want. All in one go.",
  },
  {
    n: "3",
    title: "You review everything in one place",
    body: "No inbox digging. Every request is organised and waiting for you.",
  },
  {
    n: "4",
    title: "Approved bookings stay easier to plan",
    body: "Know what is confirmed for which city before you even pack your bags.",
  },
];

function SolutionSection() {
  return (
    <section className="bg-brand-mustard px-6 py-16 md:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-xl mb-12">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-brand-charcoal md:text-4xl">
            A cleaner booking flow
            <br />
            for life on the road.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-brand-charcoal/70">
            Inklee gives traveling artists one structured booking flow that
            collects the right details upfront — so you can focus on tattooing
            instead of sorting messages.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SOLUTION_STEPS.map(({ n, title, body }) => (
            <div
              key={n}
              className="rounded-xl bg-white px-5 py-5 shadow-sm space-y-2"
            >
              <span className="text-4xl font-black leading-none text-brand-mustard">
                {n}
              </span>
              <p className="text-sm font-semibold text-brand-charcoal">
                {title}
              </p>
              <p className="text-sm leading-relaxed text-brand-charcoal/60">
                {body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <Link
            href="/signup"
            className="inline-block rounded-md bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-85"
          >
            Create your guest spot link
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── Product proof ───────────────────────────────────────────────────────── */

const PRODUCT_CARDS = [
  {
    id: "form",
    label: "Guest spot booking page",
    benefit: "Collect the right details from the start",
    // PLACEHOLDER: replace with screenshot of the guest spot booking form
    // Suggested: dark-mode screenshot, ~600×400px, cropped to form area
  },
  {
    id: "dashboard",
    label: "Request overview",
    benefit: "Review requests without city/date confusion",
    // PLACEHOLDER: replace with screenshot of request dashboard / review view
  },
  {
    id: "calendar",
    label: "Calendar & date overview",
    benefit: "Keep guest spot bookings in one clear view",
    // PLACEHOLDER: replace with calendar or date/city overview screenshot
  },
];

function ProductProofSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 md:py-24">
      <div className="max-w-xl mb-12">
        <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
          See the guest spot flow
          <br />
          before the inbox fills up
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Every request comes in structured, sorted, and ready to act on. No
          chasing. No confusion about which city or which dates.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PRODUCT_CARDS.map((card) => (
          <div key={card.id} className="space-y-3">
            {/* PLACEHOLDER: product screenshot — replace this div with <img> or <Image> */}
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/10">
              <div className="space-y-1 text-center px-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Screenshot placeholder
                </p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {card.label}
              </p>
              <p className="text-sm text-muted-foreground">{card.benefit}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Artist-native section ───────────────────────────────────────────────── */

function ArtistNativeSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 md:py-24">
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        {/* PLACEHOLDER: travel/scene-native visual — replace this div with an illustration
            or photo that fits the traveling artist context. Similar visual tone to
            homepage artist.svg. Suggested size: up to ~400×480px. */}
        <div className="flex justify-center md:justify-start">
          <div className="flex h-72 w-full max-w-xs items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/10 md:max-w-sm">
            <div className="space-y-1 text-center px-4">
              <p className="text-xs font-medium text-muted-foreground">
                Visual placeholder
              </p>
              <p className="text-xs text-muted-foreground">
                Travel artist illustration
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
            Built by tattoo artists,
            <br />
            for tattoo artists.
          </h2>
          <p className="mt-5 text-sm font-semibold text-foreground">
            Inklee is built around the real workflow behind tattooing.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Guest spots, travel dates, booking waves, Instagram messages,
            reference pictures, and all the admin that starts stacking up when
            you move between cities. Inklee is built around how that actually
            works.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            No generic appointment software. Just a cleaner{" "}
            <Link
              href="/tattoo-booking-software"
              className="underline-offset-4 hover:underline"
            >
              booking tool for traveling tattoo artists
            </Link>{" "}
            that fits the way they actually work.
          </p>
          <div className="mt-8">
            <CtaPrimary />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Trust section ───────────────────────────────────────────────────────── */

const TRUST_ITEMS = [
  {
    id: "setup",
    label: "Simple onboarding",
    body: "Guest spot booking link ready in under 5 minutes.",
  },
  {
    id: "friendly",
    label: "Artist-friendly setup",
    body: "No tech skills needed. No complicated settings to figure out.",
  },
  {
    id: "gdpr",
    label: "GDPR-conscious foundation",
    body: "Built with a responsible approach to handling client data.",
  },
];

function TrustSection() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16 items-start">
          <div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-foreground md:text-3xl">
              Clean setup.
              <br />
              Privacy-conscious foundation.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Inklee helps artists run a more professional booking process while
              keeping things simple. Built with privacy-conscious infrastructure
              and a responsible approach to handling client data.
            </p>
          </div>

          <div className="space-y-5">
            {TRUST_ITEMS.map((item) => (
              <div key={item.id} className="flex gap-3">
                <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-brand-mustard" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {item.label}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA ───────────────────────────────────────────────────────────── */

function FinalCtaSection() {
  return (
    <section className="px-6 py-24 text-center">
      <div className="mx-auto max-w-md">
        <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Running guest spots?
          <br />
          Put one clear booking link in bio.
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Inklee helps traveling tattoo artists collect structured requests,
          stay organised across cities and dates, and spend less time sorting
          out booking chaos in DMs.
        </p>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-block rounded-md border border-brand-rosa px-8 py-3 text-base font-bold text-brand-rosa transition-colors hover:bg-brand-rosa hover:text-brand-charcoal"
          >
            Create your guest spot link
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Free to get started. No payment required.
        </p>
      </div>
    </section>
  );
}

/* ─── Footer ──────────────────────────────────────────────────────────────── */

function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <SiteLogo height={16} />
          <div className="flex gap-5 text-xs text-muted-foreground">
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
              href="/imprint"
              className="transition-colors hover:text-foreground"
            >
              Imprint
            </Link>
          </div>
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} inklee
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function GuestSpotsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection />
        <div className="h-[15px] bg-brand-rosa" />
        <PainSection />
        <SolutionSection />
        <ProductProofSection />
        <ArtistNativeSection />
        <div className="h-[15px] bg-brand-red" />
        <TrustSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
