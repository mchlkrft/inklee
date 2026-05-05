import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SiteLogo from "@/components/site-logo";
import JsonLd from "@/components/seo/json-ld";
import {
  DefinitionBlock,
  FaqSection,
  RelatedLinksBlock,
} from "@/components/marketing";
import type { FaqItem, RelatedLink } from "@/lib/marketing";
import {
  organizationSchema,
  websiteSchema,
  softwareApplicationSchema,
  faqPageSchema,
} from "@/lib/jsonld";
import { getRenderableFooterGroups } from "@/lib/footer-links";

const HOMEPAGE_FAQ: FaqItem[] = [
  {
    question: "What is Inklee?",
    answer:
      "Inklee is a tattoo booking intake tool for freelance and traveling tattoo artists. It turns Instagram inquiries into structured tattoo booking requests you can review, approve, and organize in one place.",
  },
  {
    question: "Is Inklee tattoo booking software?",
    answer:
      "Yes. Inklee is tattoo booking software focused on intake — a clean booking form, structured requests, approvals, deposits, waitlists, and guest spot bookings. It is built for the way tattoo artists actually work, not generic appointment software.",
  },
  {
    question: "Can tattoo artists use Inklee with Instagram?",
    answer:
      "Inklee is designed to live next to Instagram. You drop your Inklee booking link in your bio, clients click it, and they fill in placement, size, references, and dates instead of sending Instagram DMs.",
  },
  {
    question: "Does Inklee replace Instagram DMs?",
    answer:
      "Inklee replaces Instagram DMs as your booking channel. You still use Instagram for your work and reach, but real booking requests come through your Inklee booking form so the details and history stay together.",
  },
  {
    question: "Is Inklee only for tattoo studios?",
    answer:
      "No. Inklee is built for solo and freelance tattoo artists, including artists who work guest spots or split time across studios. There is no studio-only mode and no team seat requirement.",
  },
  {
    question: "Can traveling tattoo artists use Inklee?",
    answer:
      "Yes. Traveling tattoo artists can publish trips, cities, and dates on their Inklee booking page and collect location-specific tattoo booking requests for each guest spot.",
  },
  {
    question: "Does Inklee support guest spot bookings?",
    answer:
      "Yes. Inklee supports guest spot booking with trip dates, host studios, and per-trip request collection. Clients see your travel schedule on your booking page and can request bookings for the right city and dates.",
  },
  {
    question: "Can artists collect tattoo deposits with Inklee?",
    answer:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features. The intent is to let you request a deposit on an approved request without leaving the booking workflow.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <JsonLd data={organizationSchema()} id="ld-organization" />
      <JsonLd data={websiteSchema()} id="ld-website" />
      <JsonLd data={softwareApplicationSchema()} id="ld-softwareapplication" />
      <JsonLd data={faqPageSchema(HOMEPAGE_FAQ)} id="ld-faq" />
      <SiteHeader />
      <main className="flex-1">
        <HeroSection />
        <div className="h-[15px] bg-brand-rosa" />
        <DefinitionBlock
          eyebrow="What is Inklee"
          heading="Tattoo booking software built around your real workflow."
          body={[
            "Inklee is a tattoo booking intake tool for freelance and traveling tattoo artists. It gives you a clean booking link for tattoo artists to drop in their Instagram bio so clients send a proper tattoo booking request instead of an Instagram DM.",
            "You collect placement, size, references, and dates through a structured tattoo booking form, review every request in one place, and keep approvals, deposits, waitlists, and guest spot bookings organized — without spreadsheets or scattered chats.",
          ]}
        />
        <FeaturesSection />
        <HowItWorksSection />
        <AboutSection />
        <div className="h-[15px] bg-brand-red" />
        <RelatedLinksBlock
          heading="More on the way Inklee fits tattooing"
          intro="Two short reads on the patterns Inklee is built around."
          links={HOMEPAGE_RELATED_LINKS}
        />
        <FaqSection
          eyebrow="FAQ"
          heading="Tattoo booking, answered"
          items={HOMEPAGE_FAQ}
        />
        <EasyPeasySection />
      </main>
      <SiteFooter />
    </div>
  );
}

const HOMEPAGE_RELATED_LINKS: RelatedLink[] = [
  {
    eyebrow: "Instagram DMs",
    title: "Tattoo booking from Instagram without DM chaos",
    description:
      "Why Instagram DMs break down as a tattoo booking channel and how a clean booking link in bio fixes it.",
    href: "/dm-chaos",
  },
  {
    eyebrow: "Guest spots",
    title: "Guest spot booking for traveling tattoo artists",
    description:
      "How traveling tattoo artists can manage city demand, trip dates, and per-leg booking requests in one place.",
    href: "/guest-spots",
  },
];

/* ─── Header ─────────────────────────────────────────────────────────────── */

function SiteHeader() {
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
          <div className="order-2 pb-16 pt-6 md:order-1 md:pb-24 md:pt-16 md:pr-10">
            <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
              Tattoo bookings,
              <br />
              without DM chaos
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              Turn Instagram DMs into structured tattoo requests.
              <br />
              Review ideas, manage approvals, and keep bookings organized.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-md bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
              >
                Get started free
              </Link>
              <Link
                href="/bert-grimm"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-foreground/20 px-6 py-3 text-base font-bold text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
              >
                See a live example →
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-3">
              <img
                src="/branding/badges/badge-handmade.svg"
                alt="Made by hand"
                className="h-15 w-15"
              />
              <img
                src="/branding/badges/badge-gdpr.svg"
                alt="GDPR compliant"
                className="h-15 w-15"
              />
            </div>
          </div>

          {/* Illustration */}
          <div className="order-1 flex justify-center md:order-2 md:justify-end md:-mr-8 lg:-mr-16">
            <div className="animate-hero-float w-full max-w-sm md:max-w-full">
              <img
                src="/branding/illustrations/key-visual.svg"
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

/* ─── Features ────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    id: "booking-form",
    illustration: "/branding/illustrations/feature-booking-form.svg",
    title: "Structured Booking Form",
    description:
      "Clients submit placement, size, description, and reference images — no back-and-forth to gather the basics.",
  },
  {
    id: "requests",
    illustration: "/branding/illustrations/feature-requests.svg",
    title: "Request Management",
    description:
      "Review, approve, reject, or request a deposit from a clean dashboard. Every decision is logged.",
  },
  {
    id: "deposit",
    illustration: "/branding/illustrations/feature-deposit.svg",
    title: "Deposit Collection",
    description:
      "Request deposits via Stripe. Clients pay directly from their magic link — no payment details stored on your side.",
  },
  {
    id: "waitlist",
    illustration: "/branding/illustrations/feature-waitlist.svg",
    title: "Waitlist",
    description:
      "When books are closed, clients can join a waitlist. Open a new round and convert waitlist entries into bookings.",
  },
  {
    id: "travel",
    illustration: "/branding/illustrations/feature-travel.svg",
    title: "Travel & Guestspot Mode",
    description:
      "Running a guest spot? Publish travel legs and clients see your city and dates on your booking page automatically.",
  },
  {
    id: "calendar",
    illustration: "/branding/illustrations/feature-calendar.svg",
    title: "Calendar + iCal",
    description:
      "Approved bookings appear on a calendar view. Export to Google Calendar, Apple Calendar, or any iCal app.",
  },
];

function FeaturesSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 md:py-24">
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-3 md:gap-x-12 md:gap-y-14">
        {FEATURES.map((f) => (
          <div key={f.id} className="space-y-3">
            <img
              src={f.illustration}
              alt=""
              aria-hidden="true"
              className="h-25 w-auto"
            />
            <p className="text-sm font-semibold text-foreground">{f.title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {f.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── How it works ────────────────────────────────────────────────────────── */

const STEPS = [
  { n: "01", text: "Set up your booking form & put your link in bio." },
  { n: "02", text: "Clients send you proper requests." },
  { n: "03", text: "You review, approve and organize. easy peasy." },
];

function HowItWorksSection() {
  return (
    <section className="bg-brand-mustard px-6 py-12 md:py-14">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {STEPS.map(({ n, text }) => (
            <div key={n} className="flex items-center gap-4">
              <span className="shrink-0 text-5xl font-black leading-none text-brand-charcoal md:text-6xl lg:text-7xl">
                {n}
              </span>
              <div className="rounded-xl bg-white px-5 py-4 shadow-sm">
                <p className="text-sm font-medium leading-snug text-brand-charcoal">
                  {text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── About ───────────────────────────────────────────────────────────────── */

function AboutSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 md:py-24">
      <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
        {/* Artist illustration */}
        <div className="flex justify-center md:justify-start">
          <img
            src="/branding/illustrations/artist.svg"
            alt=""
            aria-hidden="true"
            className="h-auto w-full max-w-xs md:max-w-sm"
          />
        </div>

        {/* Text */}
        <div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
            Built by tattoo artists,
            <br />
            for tattoo artists.
          </h2>
          <p className="mt-5 text-sm font-semibold text-foreground">
            Inklee is made for the real workflow behind tattooing.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Instagram DMs, too much back and forth, missing details, guest
            spots, city changes, and trying to keep bookings together while
            still focusing on the work.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Whether you stay in one studio or move from spot to spot, Inklee
            gives you a booking flow that actually fits tattooing.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
            >
              Get started free
            </Link>
            <Link
              href="/bert-grimm"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-foreground/20 px-6 py-3 text-base font-bold text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
            >
              See a live example →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Easy peasy CTA ──────────────────────────────────────────────────────── */

function EasyPeasySection() {
  return (
    <section className="px-6 py-24 text-center">
      <div className="mx-auto max-w-md">
        <img
          src="/branding/illustrations/easy-peasy.svg"
          alt=""
          aria-hidden="true"
          className="mx-auto mb-6 h-44 w-auto"
        />
        <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Your booking link in under 5 minutes
        </h2>
        <p className="mt-3 text-muted-foreground">
          No payment required — free to get started.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-md border border-brand-rosa px-8 py-3 text-base font-bold text-brand-rosa transition-colors hover:bg-brand-rosa hover:text-brand-charcoal"
        >
          Create your booking page
        </Link>
      </div>
    </section>
  );
}

/* ─── Footer ──────────────────────────────────────────────────────────────── */

function SiteFooter() {
  const groups = getRenderableFooterGroups();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand */}
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

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} inklee. All rights reserved.</span>
          <span className="opacity-40">Made for the ink.</span>
        </div>
      </div>
    </footer>
  );
}
