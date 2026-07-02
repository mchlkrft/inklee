import type { Metadata } from "next";
import Link from "next/link";
import TrackedCtaLink from "@/components/tracked-cta-link";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

const PAGE_PATH = "/best-booking-app-for-tattoo-artists";
const PAGE_TITLE = "Best Booking App for Tattoo Artists | Inklee";
const PAGE_DESCRIPTION =
  "Compare booking apps for tattoo artists, from tattoo intake tools to schedulers, forms, and studio systems. Find what fits your workflow.";
const OG_TITLE = "Best Booking App for Tattoo Artists";
const OG_DESCRIPTION =
  "A fair guide to tattoo booking apps, forms, schedulers, and studio tools for artists who want cleaner bookings.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: absoluteUrl(PAGE_PATH),
    type: "website",
  },
  twitter: {
    card: "summary",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
};

type Tool = {
  name: string;
  description: string;
  bestFor: string;
  watchOutFor: string;
  fit: string;
  variant: "mustard" | "bone" | "rosa";
};

const TOOLS: Tool[] = [
  {
    name: "Inklee",
    description:
      "A tattoo booking request tool built around structured intake, artist review, approvals, deposits, waitlists, and guest spots.",
    bestFor:
      "Solo and traveling tattoo artists who need to review tattoo ideas before approving bookings.",
    watchOutFor:
      "Not meant to replace a full salon POS or large studio management suite.",
    fit: "Tight fit for tattoo workflow.",
    variant: "mustard",
  },
  {
    name: "Square Appointments",
    description:
      "A general appointment scheduling tool connected to Square's payment and POS ecosystem.",
    bestFor:
      "Artists or studios that want scheduling connected with payments and broader business tools.",
    watchOutFor:
      "Tattoo-specific intake and project review may still need extra setup or workarounds.",
    fit: "Strong business tool, general intake fit.",
    variant: "bone",
  },
  {
    name: "Acuity Scheduling",
    description:
      "A flexible scheduling tool with appointment types, intake forms, customization, and payment options.",
    bestFor:
      "Artists who want configurable scheduling and client forms around fixed services or consultations.",
    watchOutFor:
      "Custom tattoo projects can still feel forced into a scheduler-first structure.",
    fit: "Customizable scheduler, not tattoo-native intake.",
    variant: "rosa",
  },
  {
    name: "Calendly",
    description:
      "A scheduling tool built around booking available time slots for calls, meetings, consultations, and fixed appointment types.",
    bestFor:
      "Consultations, calls, touch-ups, aftercare check-ins, or already-approved appointments.",
    watchOutFor:
      "Tattoo requests usually need idea review before a time slot should be confirmed.",
    fit: "General scheduler, not intake-first.",
    variant: "bone",
  },
  {
    name: "Booksy",
    description:
      "A booking and business app used heavily in beauty, wellness, and service-based industries.",
    bestFor:
      "Artists or studios that want a consumer-facing booking app with broader beauty-business features.",
    watchOutFor:
      "Custom tattoo intake may need more artist-specific request structure than a marketplace-style booking flow.",
    fit: "Good for service booking, less focused on custom tattoo review.",
    variant: "mustard",
  },
  {
    name: "Vagaro",
    description:
      "A broad business management platform for salon, spa, fitness, and wellness businesses.",
    bestFor:
      "Studios or larger teams that need booking, payments, client management, and business operations in one system.",
    watchOutFor:
      "May be heavier than a solo tattoo artist needs for simple request intake.",
    fit: "Studio management fit, heavier than tattoo intake.",
    variant: "rosa",
  },
  {
    name: "Google Forms",
    description:
      "A simple form builder that can collect tattoo request answers and send them into a response sheet.",
    bestFor:
      "New artists testing basic request questions with very low booking volume.",
    watchOutFor:
      "No native approval flow, booking states, guest spot structure, or tattoo-specific dashboard.",
    fit: "Free starting point, not a long-term booking setup.",
    variant: "bone",
  },
];

type DecisionRow = { audience: string; bestFit: string; why: string };

const DECISION_MATRIX: DecisionRow[] = [
  {
    audience: "Solo artist, custom work, Instagram-first",
    bestFit: "Tattoo intake tool",
    why: "You need proper requests before you decide what gets booked.",
  },
  {
    audience: "Guest spot artist, multiple cities per year",
    bestFit: "Tattoo intake tool with travel support",
    why: "City, date, and booking-window context matter more than a generic slot picker.",
  },
  {
    audience: "Studio with multiple artists, payments, and POS",
    bestFit: "Studio management system",
    why: "A larger team may need scheduling, payments, staff tools, and business operations together.",
  },
  {
    audience: "Mostly flash, low custom intake",
    bestFit: "Simple scheduler or lightweight form",
    why: "If the design is already clear, the booking process can be simpler.",
  },
  {
    audience: "Consultations and calls",
    bestFit: "Meeting-first scheduler",
    why: "When the service is just booking a time, a calendar-first tool works well.",
  },
  {
    audience: "Just starting out, very low volume",
    bestFit: "Free form or DIY setup",
    why: "If you only get a few requests, simple tools may be enough while you learn your process.",
  },
];

const FAQ = [
  {
    question: "What is the best booking app for tattoo artists?",
    answer:
      "There is no single best booking app for every tattoo artist. Custom artists often need tattoo intake and approval flow. Studios may need POS and team tools. Artists with very low request volume may only need a simple form.",
  },
  {
    question:
      "What makes tattoo booking different from regular appointment scheduling?",
    answer:
      "Tattoo booking usually starts with an idea, not a time slot. The artist needs to review placement, size, references, style fit, and timing before confirming the booking.",
  },
  {
    question: "Is Calendly good for tattoo artists?",
    answer:
      "Calendly can work for consultations, calls, touch-ups, and fixed appointments. It is less ideal when the tattoo idea needs to be reviewed before the client picks a time.",
  },
  {
    question: "Is Square Appointments good for tattoo artists?",
    answer:
      "Square Appointments can be useful for artists or studios that want scheduling connected to payments and business tools. Custom tattoo intake may still need extra structure.",
  },
  {
    question: "Is Acuity Scheduling good for tattoo artists?",
    answer:
      "Acuity is flexible and customizable, especially for scheduling and forms. It can work well for some artists, but it is still a general scheduler rather than a tattoo-first request flow.",
  },
  {
    question: "What about Google Forms for tattoo booking?",
    answer:
      "Google Forms can collect basic tattoo request information. It becomes limited when artists need approval states, deposit tracking, guest spot structure, waitlists, or a clearer booking overview.",
  },
  {
    question: "How do guest spots affect the booking tool choice?",
    answer:
      "Guest spots add city, date, and booking-window context. A traveling artist usually needs more structure than a simple calendar link or one general form.",
  },
  {
    question: "How do I migrate from Instagram DMs?",
    answer:
      "Start by putting one booking link in your bio. Use DMs for conversation, but send serious requests into a structured form so details do not get lost.",
  },
];

const RELATED = [
  {
    title: "Inklee vs Instagram DMs",
    href: "/tattoo-booking-software-vs-instagram-dms",
    description:
      "Compare scattered Instagram messages with a structured tattoo booking request flow.",
  },
  {
    title: "Inklee vs Google Forms",
    href: "/tattoo-booking-software-vs-google-forms",
    description:
      "See when a basic form is enough and when tattoo artists need a real booking workflow.",
  },
  {
    title: "Inklee vs Calendly",
    href: "/tattoo-booking-software-vs-calendly",
    description:
      "Compare slot-first scheduling with tattoo-first request intake.",
  },
];

export default function BestBookingAppPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <JsonLd
        data={webPageSchema({
          name: PAGE_TITLE,
          url: absoluteUrl(PAGE_PATH),
          description: PAGE_DESCRIPTION,
        })}
        id="ld-webpage"
      />
      <JsonLd data={faqPageSchema(FAQ)} id="ld-faq" />
      <PillNav />
      <main className="flex-1">
        {/* Hero (charcoal) */}
        <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
          <div className="container-marketing-wide">
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
              <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                  Best booking app for tattoo artists
                </p>
                <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  <span className="block">Seven booking tools,</span>
                  <span className="block text-brand-mustard">
                    one tattoo workflow.
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                  A fair guide to tattoo booking apps, forms, schedulers, and
                  studio systems. Find what fits your work without forcing
                  tattoo intake through the wrong tool.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
                  <TrackedCtaLink
                    cta="hero-signup"
                    href="/signup"
                    className="inline-flex items-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
                  >
                    Create your booking link
                  </TrackedCtaLink>
                  <Link
                    href="/tattoo-booking-software"
                    className="inline-flex items-center rounded-full border-[1.5px] border-shell-border px-6 py-3 text-base font-bold text-shell-fg-dim transition-colors hover:border-shell-fg hover:text-foreground"
                  >
                    See the booking tool →
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
              <div className="order-1 flex justify-center pt-5 md:order-2 md:pt-0">
                <div className="animate-hero-float w-full max-w-2xs md:max-w-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/branding/illustrations/mixed/inklee-_artist-shows-inklee-app.svg"
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

        {/* Definition (bone) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                There is no one best app
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                The best booking app depends
                <br />
                on how you actually work.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Custom artists need tattoo intake. Studios with multiple artists
                need staff and payment tools. Flash-only artists may need very
                little. This page walks through seven options and where each
                fits.
              </p>
            </div>
          </div>
        </section>

        {/* Tool roundup (charcoal) */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-2xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Seven options
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                What each tool
                <br />
                actually does.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
              {TOOLS.map((tool) => {
                const bg =
                  tool.variant === "mustard"
                    ? "bg-brand-mustard"
                    : tool.variant === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-brand-bone";
                return (
                  <div
                    key={tool.name}
                    className={`flex h-full flex-col gap-4 rounded-3xl p-7 ${bg}`}
                  >
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-charcoal/60">
                        {tool.fit}
                      </p>
                      <h3 className="mt-1 text-2xl font-black leading-tight text-brand-charcoal">
                        {tool.name}
                      </h3>
                    </div>
                    <p className="text-sm leading-relaxed text-brand-charcoal/75">
                      {tool.description}
                    </p>
                    <div className="mt-auto space-y-3 pt-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-charcoal/60">
                          Best for
                        </p>
                        <p className="mt-1 text-sm font-semibold text-brand-charcoal">
                          {tool.bestFor}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-charcoal/60">
                          Watch out for
                        </p>
                        <p className="mt-1 text-sm text-brand-charcoal/75">
                          {tool.watchOutFor}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Decision matrix (mustard) */}
        <section className="bg-brand-mustard">
          <div className="container-marketing py-20 md:py-28">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                Which tool when
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                Pick the tool that
                <br />
                fits your actual workflow.
              </h2>
            </div>
            <div className="space-y-3 md:space-y-4">
              {DECISION_MATRIX.map((row) => (
                <div
                  key={row.audience}
                  className="grid grid-cols-1 gap-3 rounded-3xl bg-brand-charcoal/8 p-5 md:grid-cols-[5fr_3fr_4fr] md:gap-6 md:p-6"
                >
                  <p className="text-base font-black leading-tight text-brand-charcoal md:text-lg">
                    {row.audience}
                  </p>
                  <p className="text-sm font-bold text-brand-charcoal md:text-base">
                    {row.bestFit}
                  </p>
                  <p className="text-sm leading-relaxed text-brand-charcoal/75">
                    {row.why}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ (bone) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-24 md:py-32">
            <div className="mx-auto max-w-3xl">
              <div className="mb-12 text-center">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  FAQ
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
                  Tattoo booking apps, answered.
                </h2>
              </div>
              <div className="rounded-3xl border-[1.5px] border-brand-charcoal/15 bg-[#d9d4c7] px-6 md:px-10">
                {FAQ.map((item, idx) => {
                  const number = String(idx + 1).padStart(2, "0");
                  const isLast = idx === FAQ.length - 1;
                  return (
                    <details
                      key={item.question}
                      className={`group py-5 ${isLast ? "" : "border-b border-brand-charcoal/15"}`}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                        <div className="flex items-baseline gap-5">
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-charcoal/70">
                            {number}
                          </span>
                          <span className="text-lg font-bold text-brand-charcoal">
                            {item.question}
                          </span>
                        </div>
                        <span
                          aria-hidden="true"
                          className="text-2xl font-black text-brand-charcoal/60 transition-transform group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <p className="mt-3 max-w-2xl pl-[3.25rem] text-sm leading-relaxed text-brand-charcoal/75">
                        {item.answer}
                      </p>
                    </details>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Related (charcoal) */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-20 md:py-28">
            <div className="mb-12 max-w-2xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Three head-to-head reads
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl">
                Pick a specific comparison.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              {RELATED.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex h-full flex-col justify-between gap-6 rounded-3xl border-[1.5px] border-shell-border p-6 transition-colors hover:border-shell-fg hover:bg-[#252525]"
                >
                  <div className="space-y-3">
                    <h3 className="text-xl font-black leading-tight text-shell-fg">
                      {link.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-shell-fg-dim">
                      {link.description}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-shell-fg-dim transition-colors group-hover:text-shell-fg">
                    Read more →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA (rosa) */}
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
                If tattoo intake is
                <br />
                the work, Inklee fits.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Built specifically for solo and traveling tattoo artists who
                need to review the idea before approving a booking.
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
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
