import type { Metadata } from "next";
import Link from "next/link";
import SiteLogo from "@/components/site-logo";

export const metadata: Metadata = {
  title: "Stop Tattoo DM Chaos · Inklee",
  description:
    "Tattoo booking from Instagram without the DM mess. Stop losing tattoo requests and turn tattoo DM booking into structured requests.",
  alternates: {
    canonical: "/dm-chaos",
  },
  openGraph: {
    title: "Booking requests without DM chaos",
    description:
      "Inklee helps tattoo artists stop losing requests in Instagram DMs and collect the details they need before replying.",
    url: "https://inklee.app/dm-chaos",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Booking requests without DM chaos",
    description:
      "Inklee helps tattoo artists stop losing requests in Instagram DMs and collect the details they need before replying.",
  },
};

/* ─── Shared CTA ──────────────────────────────────────────────────────────── */

function CtaPrimary({
  label = "Create your booking link",
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
    <header className="container-marketing-wide flex items-center justify-between py-5">
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
    <section className="overflow-hidden md:flex md:min-h-[calc(100svh-87px)] md:items-center">
      <div className="container-marketing-wide">
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[5fr_7fr] md:gap-0">
          {/* Text */}
          <div className="order-2 pb-16 pt-6 md:order-1 md:py-16 md:pr-10">
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
              Booking requests
              <br />
              without DM chaos
            </h1>
            <p className="mt-5 max-w-xs text-base leading-relaxed text-muted-foreground sm:text-lg">
              Turn scattered Instagram DMs into structured tattoo requests with
              one clean link in bio.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaPrimary />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Made for tattoo artists who want less back and forth and more real
              bookings.
            </p>
          </div>

          {/* Hero visual placeholder — replace with final DM-chaos contrast illustration */}
          <div className="order-1 flex justify-center md:order-2 md:justify-end md:-mr-8 lg:-mr-16">
            <div className="w-full max-w-sm md:max-w-full">
              {/* PLACEHOLDER: hero visual — two-panel composition showing messy DMs on left,
                  clean Inklee booking form on right. Suggested size: ~600×480px.
                  Replace this block with an <img> or <Image> pointing to final asset. */}
              <div className="flex h-80 w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/10 md:h-[420px]">
                <div className="space-y-2 text-center px-6">
                  <p className="text-sm font-medium text-muted-foreground">
                    Hero visual placeholder
                  </p>
                  <p className="text-xs text-muted-foreground">
                    DM chaos → clean booking form contrast
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
    id: "lost",
    icon: "📥",
    title: "Requests get lost in busy DMs",
    body: "A real inquiry arrives, then gets buried under memes, story replies, and random messages. You miss it.",
  },
  {
    id: "details",
    icon: "🗒️",
    title: "Clients leave out key details",
    body: "No size, no placement, no reference. You have to ask. They reply. You ask again. Nothing moves fast.",
  },
  {
    id: "backforth",
    icon: "🔁",
    title: "Too much back and forth",
    body: "Before anything is even close to confirmed you have already sent ten messages. For a booking that might not happen.",
  },
  {
    id: "mixed",
    icon: "🌀",
    title: "Serious and random all in one place",
    body: "Real clients with real projects are mixed in with questions, compliments, and people asking your rates for the fifth time.",
  },
];

function PainSection() {
  return (
    <section className="container-marketing py-20 md:py-24">
      <div className="max-w-xl">
        <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
          Instagram gets you attention.
          <br />
          It does not give you structure.
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Clients message in whatever way feels natural to them. Important
          details go missing. Chats get buried. And you end up repeating the
          same questions again and again just to understand what someone
          actually wants.
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
    title: "Client clicks your booking link",
    body: "One clean link in bio. No DMs needed to get started.",
  },
  {
    n: "2",
    title: "They send a proper tattoo request",
    body: "Size, placement, description, references — all in one go.",
  },
  {
    n: "3",
    title: "You review everything in one place",
    body: "No digging through DMs. Every request is waiting in your dashboard.",
  },
  {
    n: "4",
    title: "Approved bookings stay organized",
    body: "Know what is confirmed, what is pending, what needs a deposit.",
  },
];

function SolutionSection() {
  return (
    <section className="bg-brand-mustard py-16 md:py-20">
      <div className="container-marketing">
        <div className="max-w-xl mb-12">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-brand-charcoal md:text-4xl">
            One link. Cleaner requests.
            <br />
            Less chaos.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-brand-charcoal/70">
            Inklee replaces your booking DMs with a{" "}
            <Link
              href="/tattoo-booking-form"
              className="underline-offset-4 hover:underline"
            >
              tattoo request form
            </Link>{" "}
            that captures the right details upfront so you can spend less time
            chasing and more time tattooing.
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
            Create your booking link
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
    label: "Booking form",
    benefit: "Get the details before you reply",
    // PLACEHOLDER: replace placeholder div below with screenshot of booking form
    // Suggested: dark-mode screenshot, ~600×400px, cropped to form area
  },
  {
    id: "dashboard",
    label: "Request review",
    benefit: "Review requests without DM chaos",
    // PLACEHOLDER: replace placeholder div below with dashboard / request list screenshot
  },
  {
    id: "calendar",
    label: "Calendar",
    benefit: "Keep approved bookings in one clear view",
    // PLACEHOLDER: replace placeholder div below with calendar screenshot
  },
];

function ProductProofSection() {
  return (
    <section className="container-marketing py-20 md:py-24">
      <div className="max-w-xl mb-12">
        <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
          See the flow before the back and forth starts
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Everything a client sends lands in a clean, structured format. No
          digging. No chasing. Just requests you can actually act on.
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
    <section className="container-marketing py-20 md:py-24">
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        {/* PLACEHOLDER: artist-style visual — replace this div with an illustration or photo */}
        {/* Suggested: scene-native artist illustration, similar tone to homepage artist.svg */}
        <div className="flex justify-center md:justify-start">
          <div className="flex h-72 w-full max-w-xs items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/10 md:max-w-sm">
            <div className="space-y-1 text-center px-4">
              <p className="text-xs font-medium text-muted-foreground">
                Visual placeholder
              </p>
              <p className="text-xs text-muted-foreground">
                Artist-native illustration
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
            Instagram DMs, reference pictures, missing details, booking back and
            forth, and trying to keep everything together while still focusing
            on the work.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            No generic appointment software. Just a cleaner booking flow that
            fits tattooing — see how{" "}
            <Link
              href="/tattoo-booking-software-vs-instagram-dms"
              className="underline-offset-4 hover:underline"
            >
              Instagram DMs vs a tattoo booking tool
            </Link>{" "}
            compare.
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
    body: "Booking link ready in under 5 minutes.",
  },
  {
    id: "friendly",
    label: "Artist-friendly setup",
    body: "No tech skills needed. No complicated settings.",
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
      <div className="container-marketing py-16 md:py-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16 items-start">
          <div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-foreground md:text-3xl">
              Clean setup.
              <br />
              Privacy-conscious foundation.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Inklee helps artists create a more professional booking experience
              while keeping things simple. Built with privacy-conscious
              infrastructure and a responsible approach to handling client data.
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
          Your DMs are not
          <br />a booking system.
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Put one clean booking link in your bio and turn messy Instagram chats
          into structured tattoo requests with a{" "}
          <Link
            href="/tattoo-booking-software"
            className="underline-offset-4 hover:underline"
          >
            tattoo booking tool built for Instagram requests
          </Link>
          .
        </p>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-block rounded-md border border-brand-rosa px-8 py-3 text-base font-bold text-brand-rosa transition-colors hover:bg-brand-rosa hover:text-brand-charcoal"
          >
            Create your booking link
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
      <div className="container-marketing py-8">
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

export default function DmChaosPage() {
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
