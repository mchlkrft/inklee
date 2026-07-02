import type { Metadata } from "next";
import Link from "next/link";
import TrackedCtaLink from "@/components/tracked-cta-link";
import SiteLogo from "@/components/site-logo";
import { getRenderableFooterGroups } from "@/lib/footer-links";
import { PillNav } from "@/components/marketing-v2";
import JsonLd from "@/components/seo/json-ld";
import { webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";

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

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function DmChaosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <JsonLd
        id="ld-webpage"
        data={webPageSchema({
          name: "Stop tattoo DM chaos",
          url: absoluteUrl("/dm-chaos"),
          description:
            "Tattoo booking from Instagram without the DM mess. Stop losing tattoo requests and turn tattoo DM booking into structured requests.",
        })}
      />
      <PillNav />
      <main className="flex-1">
        <HeroSection />
        <PainSection />
        <SolutionSection />
        <ProductProofSection />
        <ArtistNativeSection />
        <FinalCtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}

/* Nav is now the shared marketing-v2/PillNav (import above). Local copy
   removed so the FAB scroll-grow + mobile sizing stay in one place. */

/* ─── Hero (charcoal) ───────────────────────────────────────────────────── */

function HeroSection() {
  return (
    <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
      <div className="container-marketing-wide">
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
          {/* Text */}
          <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
              <span className="block">Booking requests,</span>
              <span className="block text-brand-mustard">
                without DM chaos.
              </span>
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg md:mt-5">
              Turn scattered Instagram DMs into structured tattoo requests with
              one clean link in bio. Stop chasing details across chats and start
              reviewing real bookings.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
              <TrackedCtaLink
                cta="hero-signup"
                href="/signup"
                className="inline-flex items-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
              >
                Get started free
              </TrackedCtaLink>
              <Link
                href="/bert-grimm"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border-[1.5px] border-shell-border px-6 py-3 text-base font-bold text-shell-fg-dim transition-colors hover:border-shell-fg hover:text-foreground"
              >
                See a live example →
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-3 md:mt-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/badges/badge-handmade.svg"
                alt="Made by hand"
                className="h-12 w-12 md:h-14 md:w-14"
                draggable={false}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/badges/badge-gdpr.svg"
                alt="GDPR compliant"
                className="h-12 w-12 md:h-14 md:w-14"
                draggable={false}
              />
            </div>
          </div>

          {/* Illustration — DM-Questions visual, brand graphic of the chaos
              the page is naming. Negative right margin lets it bleed past
              the container edge on desktop, matching the homepage rhythm. */}
          <div className="order-1 flex justify-center pt-5 md:order-2 md:-mr-8 md:justify-end md:pt-0 lg:-mr-16">
            <div className="animate-hero-float w-full max-w-sm md:max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/illustrations/mixed/inklee-_DM-Questions.svg"
                alt=""
                aria-hidden="true"
                className="h-auto w-full"
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Pain section (bone, scoped light) ─────────────────────────────────── */

const PAIN_POINTS: Array<{
  title: string;
  body: string;
  variant: "bone-card" | "mustard" | "rosa";
}> = [
  {
    title: "Requests get lost in busy DMs",
    body: "A real inquiry arrives, then gets buried under memes, story replies, and random messages. You miss it.",
    variant: "mustard",
  },
  {
    title: "Clients leave out key details",
    body: "No size, no placement, no reference. You have to ask. They reply. You ask again. Nothing moves fast.",
    variant: "bone-card",
  },
  {
    title: "Too much back and forth",
    body: "Before anything is even close to confirmed you have already sent ten messages. For a booking that might not happen.",
    variant: "rosa",
  },
  {
    title: "Serious and random all in one place",
    body: "Real clients with real projects are mixed in with questions, compliments, and people asking your rates for the fifth time.",
    variant: "bone-card",
  },
];

function PainSection() {
  return (
    <section
      data-appearance="light"
      className="bg-brand-bone text-brand-charcoal"
    >
      <div className="container-marketing py-20 md:py-28">
        <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
          {/* Left: heading + intro */}
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
              The DM problem
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
              Instagram gets you attention.
              <br />
              It does not give you structure.
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
              Clients message in whatever way feels natural to them. Important
              details go missing. Chats get buried. And you end up repeating the
              same questions again and again just to understand what someone
              actually wants.
            </p>
          </div>

          {/* Right: 4 cards stacked vertically */}
          <div className="space-y-4 md:space-y-5">
            {PAIN_POINTS.map((p) => {
              const bgClass =
                p.variant === "mustard"
                  ? "bg-brand-mustard"
                  : p.variant === "rosa"
                    ? "bg-brand-rosa"
                    : "bg-[#d9d4c7]";
              return (
                <div
                  key={p.title}
                  className={`flex flex-col gap-2 rounded-3xl p-6 md:p-7 ${bgClass}`}
                >
                  <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                    {p.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-brand-charcoal/75">
                    {p.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Solution (mustard) ────────────────────────────────────────────────── */

const SOLUTION_STEPS = [
  {
    n: "01",
    title: "Client clicks your booking link",
    body: "One clean link in bio. No DMs needed to get started.",
  },
  {
    n: "02",
    title: "They send a proper tattoo request",
    body: "Size, placement, description, references. All in one go.",
  },
  {
    n: "03",
    title: "You review everything in one place",
    body: "No digging through DMs. Every request is waiting in your dashboard.",
  },
  {
    n: "04",
    title: "Approved bookings stay organized",
    body: "Know what is confirmed, what is pending, what needs a deposit.",
  },
];

function SolutionSection() {
  return (
    <section className="bg-brand-mustard">
      <div className="container-marketing py-20 md:py-28">
        <div className="mb-12 max-w-2xl">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
            The Inklee flow
          </p>
          <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
            One link.
            <br />
            Cleaner requests.
            <br />
            Less chaos.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
            Inklee replaces your booking DMs with a{" "}
            <Link
              href="/tattoo-booking-form"
              className="font-bold underline-offset-4 hover:underline"
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
              className="flex flex-col gap-3 rounded-3xl bg-brand-charcoal/8 p-6"
            >
              <span className="text-4xl font-black leading-none text-brand-charcoal md:text-5xl">
                {n}
              </span>
              <h3 className="text-base font-black leading-tight text-brand-charcoal md:text-lg">
                {title}
              </h3>
              <p className="text-sm leading-relaxed text-brand-charcoal/75">
                {body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <TrackedCtaLink
            cta="mid-signup"
            href="/signup"
            className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
          >
            Create your booking link
          </TrackedCtaLink>
        </div>
      </div>
    </section>
  );
}

/* ─── Product proof (charcoal) ──────────────────────────────────────────── */

/* Faux-UI panels. Each approximates an Inklee screen using brand tokens
   so the card actually communicates the feature it names, instead of
   loaning a brand illustration that doesn't match the surface. Same
   pattern the /download device-preview uses. */

function FauxBookingForm() {
  return (
    <div className="rounded-2xl bg-brand-bone p-4 shadow-card">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-brand-charcoal/60">
        Tattoo request
      </p>
      <div className="space-y-2.5">
        <div>
          <p className="mb-1 text-[10px] font-semibold text-brand-charcoal/70">
            Placement
          </p>
          <div className="rounded-lg border-[1.5px] border-brand-charcoal/15 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-brand-charcoal">
            Left forearm
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold text-brand-charcoal/70">
            Size
          </p>
          <div className="rounded-lg border-[1.5px] border-brand-charcoal/15 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-brand-charcoal">
            Medium · 10–15 cm
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold text-brand-charcoal/70">
            References
          </p>
          <div className="flex gap-1.5">
            <div className="h-8 w-8 rounded-md bg-brand-charcoal/20" />
            <div className="h-8 w-8 rounded-md bg-brand-charcoal/30" />
            <div className="h-8 w-8 rounded-md bg-brand-charcoal/15" />
          </div>
        </div>
        <div className="mt-1 rounded-full bg-brand-charcoal py-1.5 text-center text-[11px] font-bold text-brand-bone">
          Send request
        </div>
      </div>
    </div>
  );
}

function FauxRequestReview() {
  return (
    <div className="space-y-2 rounded-2xl bg-brand-charcoal p-3 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-bone/60">
          Requests · 3
        </p>
        <span className="rounded-full bg-brand-mustard px-1.5 py-0.5 text-[9px] font-black text-brand-charcoal">
          NEW
        </span>
      </div>
      <div className="rounded-xl border-[1.5px] border-shell-border bg-[#252525] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-brand-rosa" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold text-brand-bone">
              @joana.ink
            </p>
            <p className="truncate text-[10px] text-brand-bone/60">
              Forearm sleeve · Medium
            </p>
          </div>
        </div>
        <div className="mt-2 flex gap-1.5">
          <div className="flex-1 rounded-full bg-brand-mustard py-1 text-center text-[10px] font-bold text-brand-charcoal">
            Accept
          </div>
          <div className="rounded-full border-[1.5px] border-shell-border px-2 py-1 text-center text-[10px] font-semibold text-brand-bone/70">
            Pass
          </div>
        </div>
      </div>
      <div className="rounded-xl border-[1.5px] border-shell-border bg-[#252525] px-3 py-2.5 opacity-60">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-brand-mustard" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold text-brand-bone">
              @max_inks
            </p>
            <p className="truncate text-[10px] text-brand-bone/60">
              Calf piece · Large
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FauxBookingCalendar() {
  return (
    <div className="rounded-2xl bg-brand-bone p-3 shadow-card">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-charcoal/60">
        Calendar · June
      </p>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 28 }).map((_, i) => {
          const day = i + 1;
          const isToday = day === 12;
          const isBooked = [4, 8, 12, 18, 24].includes(day);
          return (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center rounded-md text-[9px] font-bold ${
                isToday
                  ? "bg-brand-charcoal text-brand-bone"
                  : isBooked
                    ? "bg-brand-mustard text-brand-charcoal"
                    : "bg-white/40 text-brand-charcoal/60"
              }`}
            >
              {day}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/55 p-2">
        <span className="h-2 w-2 rounded-full bg-brand-mustard" />
        <p className="text-[10px] font-semibold text-brand-charcoal">
          5 booked this month
        </p>
      </div>
    </div>
  );
}

const PRODUCT_CARDS: Array<{
  label: string;
  benefit: string;
  variant: "bone" | "mustard" | "rosa";
  Faux: () => React.ReactElement;
}> = [
  {
    label: "Booking form",
    benefit: "Get the details before you reply",
    variant: "mustard",
    Faux: FauxBookingForm,
  },
  {
    label: "Request review",
    benefit: "Review requests without DM chaos",
    variant: "bone",
    Faux: FauxRequestReview,
  },
  {
    label: "Booking calendar",
    benefit: "Keep approved bookings in one clear view",
    variant: "rosa",
    Faux: FauxBookingCalendar,
  },
];

function ProductProofSection() {
  return (
    <section className="bg-shell-bg text-shell-fg">
      <div className="container-marketing py-24 md:py-32">
        <div className="mb-12 max-w-3xl md:mb-16">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
            What it looks like
          </p>
          <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
            See the flow
            <br />
            before the back-and-forth starts.
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-shell-fg-dim">
            Everything a client sends lands in a clean, structured format. No
            digging. No chasing. Just requests you can actually act on.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          {PRODUCT_CARDS.map((card) => {
            const bgClass =
              card.variant === "mustard"
                ? "bg-brand-mustard"
                : card.variant === "rosa"
                  ? "bg-brand-rosa"
                  : "bg-brand-bone";
            const { Faux } = card;
            return (
              <div
                key={card.label}
                className={`flex h-full flex-col gap-5 rounded-3xl p-6 ${bgClass}`}
              >
                <Faux />
                <div className="space-y-2">
                  <h3 className="text-xl font-black leading-tight text-brand-charcoal">
                    {card.label}
                  </h3>
                  <p className="text-sm leading-relaxed text-brand-charcoal/75">
                    {card.benefit}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Artist-native (bone, scoped) ──────────────────────────────────────── */

function ArtistNativeSection() {
  return (
    <section
      data-appearance="light"
      className="bg-brand-bone text-brand-charcoal"
    >
      <div className="container-marketing py-20 md:py-28">
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
          <div className="flex justify-center md:justify-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/illustrations/mixed/inklee-_artist-using-inklee.svg"
              alt=""
              aria-hidden="true"
              className="h-auto w-full max-w-sm md:max-w-md"
              draggable={false}
            />
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
              Built by a tattoo artist
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
              By tattoo artists.
              <br />
              For tattoo artists.
            </h2>
            <p className="mt-6 max-w-xl text-base font-semibold leading-relaxed text-brand-charcoal md:text-lg">
              Inklee is built around the real workflow behind tattooing.
            </p>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-brand-charcoal/75">
              Instagram DMs, reference pictures, missing details, booking back
              and forth, and trying to keep everything together while still
              focusing on the work.
            </p>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-brand-charcoal/75">
              No generic appointment software. Just a cleaner booking flow that
              fits tattooing. See how{" "}
              <Link
                href="/tattoo-booking-software-vs-instagram-dms"
                className="font-bold underline-offset-4 hover:underline"
              >
                Instagram DMs vs a tattoo booking tool
              </Link>{" "}
              compare.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <TrackedCtaLink
                cta="mid-signup-2"
                href="/signup"
                className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
              >
                Create your booking link
              </TrackedCtaLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA (rosa) ──────────────────────────────────────────────────── */

function FinalCtaSection() {
  return (
    <section className="bg-brand-rosa">
      <div className="container-marketing py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/illustrations/easy-peasy.svg"
            alt=""
            aria-hidden="true"
            className="mx-auto mb-8 h-28 w-auto md:h-36"
            draggable={false}
          />
          <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-6xl lg:text-7xl">
            Your DMs are not
            <br />a booking system.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
            Put one clean booking link in your bio and turn messy Instagram
            chats into structured tattoo requests with a{" "}
            <Link
              href="/tattoo-booking-software"
              className="font-bold underline-offset-4 hover:underline"
            >
              tattoo booking tool built for Instagram requests
            </Link>
            .
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <TrackedCtaLink
              cta="final-signup"
              href="/signup"
              className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
            >
              Create your booking link
            </TrackedCtaLink>
          </div>
          <p className="mt-4 text-xs text-brand-charcoal/70">
            Free to get started. No payment required.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Site footer (matches homepage) ────────────────────────────────────── */

function SiteFooter() {
  const groups = getRenderableFooterGroups();
  return (
    <footer className="border-t border-border">
      <div className="container-marketing py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <SiteLogo height={16} />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Booking tools for freelance and
              <br />
              traveling tattoo artists.
            </p>
          </div>

          {groups.map((group) => (
            <div key={group.id}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-3 space-y-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      {...(item.external && {
                        target: "_blank",
                        rel: "noopener noreferrer",
                      })}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Inklee. All rights reserved.</span>
          <span className="opacity-40">Made for the ink.</span>
        </div>
      </div>
    </footer>
  );
}
