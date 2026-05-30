import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SiteLogo from "@/components/site-logo";
import JsonLd from "@/components/seo/json-ld";
import type { FaqItem } from "@/lib/marketing";
import {
  organizationSchema,
  websiteSchema,
  softwareApplicationSchema,
  faqPageSchema,
} from "@/lib/jsonld";
import { getRenderableFooterGroups } from "@/lib/footer-links";
import { PillNav } from "@/components/marketing-v2";

/* ─── FAQ data ───────────────────────────────────────────────────────────── */

const HOMEPAGE_FAQ: FaqItem[] = [
  {
    question: "What is Inklee?",
    answer:
      "Inklee is a tattoo booking intake tool for freelance and traveling tattoo artists. It turns Instagram inquiries into structured tattoo booking requests you can review, approve, and organize in one place.",
  },
  {
    question: "Is Inklee tattoo booking software?",
    answer:
      "Yes. Inklee is tattoo booking software focused on intake: a clean booking form, structured requests, approvals, deposits, waitlists, and guest spot bookings. It is built for the way tattoo artists actually work, not generic appointment software.",
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

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* LCP preload — fetch the hero illustration at high priority before the
          browser would otherwise discover it. React 19 hoists this <link> into
          <head> during SSR. */}
      <link
        rel="preload"
        as="image"
        href="/branding/illustrations/key-visual.svg"
        fetchPriority="high"
      />
      <JsonLd data={organizationSchema()} id="ld-organization" />
      <JsonLd data={websiteSchema()} id="ld-website" />
      <JsonLd data={softwareApplicationSchema()} id="ld-softwareapplication" />
      <JsonLd data={faqPageSchema(HOMEPAGE_FAQ)} id="ld-faq" />
      <PillNav />
      <main className="flex-1">
        <HeroSection />
        <DefinitionSection />
        <FeaturesSection />
        <HowItWorksSection />
        <AboutSection />
        <FinalCtaSection />
        <FaqHomeSection />
      </main>
      <SiteFooter />
    </div>
  );
}

/* Floating two-pill nav is now the shared marketing-v2/PillNav (import above).
   Local copy removed so the FAB scroll-grow + mobile sizing stay in one place. */

/* ─── Hero (charcoal) ────────────────────────────────────────────────────── */

function HeroSection() {
  return (
    // Reverted to the original prod layout per founder direction. Restored:
    // container-marketing-wide (vs the narrower marketing container), the
    // 5fr/7fr grid (graphic takes the larger column), mobile-order reversed
    // (illustration above text), text-7xl headline cap (vs the redesign's
    // text-[88px]), and the negative right-margin bleed on the illustration
    // (-mr-8 / lg:-mr-16). Kept from the redesign: the mustard accent on
    // "without DM chaos.", the rounded-full button style (the locked
    // platform design language), and the badge row.
    <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
      <div className="container-marketing-wide">
        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[5fr_7fr] md:gap-0">
          {/* Text */}
          <div className="order-2 pb-10 md:order-1 md:py-16 md:pr-10">
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
              <span className="block">Tattoo bookings,</span>
              <span className="block text-brand-mustard">
                without DM chaos.
              </span>
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg md:mt-5">
              Turn Instagram DMs into structured tattoo requests. Review ideas,
              manage approvals, and keep bookings organized in one booking link.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
              <Link
                href="/signup"
                className="inline-flex items-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
              >
                Get started free
              </Link>
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
                width={56}
                height={56}
                decoding="async"
                className="h-12 w-12 md:h-14 md:w-14"
                draggable={false}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/badges/badge-gdpr.svg"
                alt="GDPR compliant"
                width={56}
                height={56}
                decoding="async"
                className="h-12 w-12 md:h-14 md:w-14"
                draggable={false}
              />
            </div>
          </div>

          {/* Illustration — pt-5 reserves room on mobile so the float
              animation (translateY -18px) stays inside section bounds.
              md:-mr-8 / lg:-mr-16 lets the visual bleed past the
              container edge on desktop. */}
          <div className="order-1 flex justify-center pt-12 md:order-2 md:-mr-8 md:justify-end md:pt-0 lg:-mr-16">
            <div className="animate-hero-float w-full max-w-sm md:max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/illustrations/key-visual.svg"
                alt=""
                aria-hidden="true"
                width={1532}
                height={1101}
                fetchPriority="high"
                decoding="async"
                loading="eager"
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

/* ─── Definition (bone, scoped light-mode) ───────────────────────────────── */

function DefinitionSection() {
  return (
    <section
      data-appearance="light"
      className="bg-brand-bone text-brand-charcoal"
    >
      <div className="container-marketing py-20 md:py-28">
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[6fr_6fr] md:gap-16">
          {/* Illustration left, text right (per founder layout direction).
              SEO-heavy body copy: tattoo booking software / tattoo booking
              intake tool / tattoo booking form / freelance and traveling
              tattoo artists / Instagram bio / guest spot bookings. */}
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/illustrations/mixed/inklee-_booking-link-tattoo-request.svg"
              alt=""
              aria-hidden="true"
              width={2025}
              height={1403}
              loading="lazy"
              decoding="async"
              className="mx-auto h-auto w-full max-w-lg md:mx-0"
              draggable={false}
            />
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
              What is Inklee
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
              Tattoo booking software,
              <br />
              shaped like a studio.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
              Inklee is a tattoo booking intake tool for freelance and traveling
              tattoo artists. A clean booking link for your Instagram bio, a
              structured tattoo booking form for placement, size, and
              references, and a dashboard that keeps approvals, deposits,
              waitlists, and guest spot bookings in one place.
            </p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
              Built for the way tattoo artists actually work, not generic
              appointment software.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Features (charcoal with colored cards) ─────────────────────────────── */

type FeatureCardVariant = "bone" | "mustard" | "rosa";

const FEATURES: Array<{
  title: string;
  description: string;
  illustration: string;
  variant: FeatureCardVariant;
}> = [
  {
    title: "Structured booking form",
    description:
      "Clients submit placement, size, description, and reference images. No back-and-forth to gather the basics.",
    illustration: "/branding/illustrations/feature-booking-form.svg",
    variant: "mustard",
  },
  // Content swapped with position 4 ("Request management") per founder
  // direction: the request graphic reads better on rosa than bone, the
  // waitlist graphic reads better on bone than rosa. Variant rotation
  // (mustard/bone/rosa/rosa/mustard/bone) stays the same.
  {
    title: "Waitlist",
    description:
      "When books are closed, clients join the waitlist. Open a new round and move waitlist entries into bookings.",
    illustration: "/branding/illustrations/feature-waitlist.svg",
    variant: "bone",
  },
  {
    title: "Deposit collection",
    description:
      "Deposits are part of the booking flow. Request, track paid, and confirm the booking without leaving the request.",
    illustration: "/branding/illustrations/feature-deposit.svg",
    variant: "rosa",
  },
  {
    title: "Request management",
    description:
      "Review, approve, pass, or request a deposit from a clean dashboard. Every decision is logged.",
    illustration: "/branding/illustrations/feature-requests.svg",
    variant: "rosa",
  },
  {
    title: "Trips and guest spots",
    description:
      "Publish travel legs and clients see your city and dates on your booking page automatically.",
    illustration: "/branding/illustrations/feature-travel.svg",
    variant: "mustard",
  },
  {
    title: "Calendar and iCal",
    description:
      "Approved bookings appear on a calendar view. Export to Google Calendar, Apple Calendar, or any iCal app.",
    illustration: "/branding/illustrations/feature-calendar.svg",
    variant: "bone",
  },
];

function FeatureCard({
  title,
  description,
  illustration,
  variant,
}: {
  title: string;
  description: string;
  illustration: string;
  variant: FeatureCardVariant;
}) {
  const bgClass =
    variant === "mustard"
      ? "bg-brand-mustard"
      : variant === "rosa"
        ? "bg-brand-rosa"
        : "bg-brand-bone";
  return (
    <div className={`flex h-full flex-col gap-5 rounded-3xl p-7 ${bgClass}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={illustration}
        alt=""
        aria-hidden="true"
        width={240}
        height={120}
        loading="lazy"
        decoding="async"
        className="h-20 w-auto self-start"
        draggable={false}
      />
      <div className="space-y-2">
        <h3 className="text-xl font-black leading-tight text-brand-charcoal">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-brand-charcoal/75">
          {description}
        </p>
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section className="bg-shell-bg text-shell-fg">
      <div className="container-marketing py-24 md:py-32">
        <div className="mb-12 max-w-3xl md:mb-16">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
            What you get
          </p>
          <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
            Every step of the
            <br />
            booking flow, in one place.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 md:gap-6">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── How it works (mustard, the one bold-color section) ────────────────── */

const STEPS = [
  {
    n: "01",
    title: "Set up your link",
    body: "Build your booking form, set your slot patterns, and put your Inklee link in your Instagram bio.",
  },
  {
    n: "02",
    title: "Clients send proper requests",
    body: "Placement, size, references, and dates land in your dashboard instead of in scattered DMs.",
  },
  {
    n: "03",
    title: "You decide, in one place",
    body: "Accept, pass, request a deposit, or move it to the waitlist. The whole booking history stays together.",
  },
];

function HowItWorksSection() {
  return (
    <section className="bg-brand-mustard">
      <div className="container-marketing py-20 md:py-28">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
              How it works
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
              Three steps.
              <br />
              Zero detour.
            </h2>
          </div>
          <div className="space-y-6">
            {STEPS.map(({ n, title, body }) => (
              <div
                key={n}
                className="flex items-start gap-5 rounded-2xl bg-brand-charcoal/8 p-5 md:gap-6"
              >
                <span className="shrink-0 text-5xl font-black leading-none text-brand-charcoal md:text-6xl">
                  {n}
                </span>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-brand-charcoal/75">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── About (bone, scoped light) ────────────────────────────────────────── */

function AboutSection() {
  return (
    <section
      data-appearance="light"
      className="bg-brand-bone text-brand-charcoal"
    >
      <div className="container-marketing py-20 md:py-28">
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
          <div className="order-last md:order-first">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/illustrations/mixed/inklee-_artist-drawing-on-ipad.svg"
              alt=""
              aria-hidden="true"
              width={1507}
              height={1873}
              loading="lazy"
              decoding="async"
              className="mx-auto h-auto w-full max-w-sm"
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
            <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
              Instagram DMs, too much back and forth, missing details, guest
              spots, city changes, and trying to keep bookings together while
              still focusing on the work. Inklee is the booking flow that
              actually fits tattooing, whether you stay in one studio or move
              from spot to spot.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
              >
                Get started free
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center rounded-full border-[1.5px] border-brand-charcoal px-6 py-3 text-base font-bold text-brand-charcoal transition-colors hover:bg-brand-charcoal/8"
              >
                Read more →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA (rosa — the second bold-color moment) ───────────────────── */

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
            width={312}
            height={352}
            loading="lazy"
            decoding="async"
            className="mx-auto mb-8 h-28 w-auto md:h-36"
            draggable={false}
          />
          <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-6xl lg:text-7xl">
            Your booking link,
            <br />
            in under 5 minutes.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
            No payment required. Free to get started.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
            >
              Create your booking page
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ (charcoal, numbered card pattern) ─────────────────────────────── */

function FaqHomeSection() {
  return (
    <section className="bg-shell-bg text-shell-fg">
      <div className="container-marketing py-24 md:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12 text-center">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
              FAQ
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl">
              Quick answers.
            </h2>
          </div>
          <div className="rounded-3xl border-[1.5px] border-shell-border bg-[#252525] px-6 md:px-10">
            {HOMEPAGE_FAQ.map((item, idx) => {
              const number = String(idx + 1).padStart(2, "0");
              const isLast = idx === HOMEPAGE_FAQ.length - 1;
              // JSX conditional instead of `last:border-b-0`: the global
              // `.border-b:not(.border-transparent)` rule in globals.css
              // wins source-order against the Tailwind last: utility, so
              // the last row's border still rendered next to the card's
              // outer border (visually a doubled 3px line). Not adding
              // the class at all is the only robust fix.
              return (
                <details
                  key={item.question}
                  className={`group py-5 ${
                    isLast ? "" : "border-b border-shell-border"
                  }`}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <div className="flex items-baseline gap-5">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-mustard">
                        {number}
                      </span>
                      <span className="text-lg font-bold text-shell-fg">
                        {item.question}
                      </span>
                    </div>
                    <span
                      aria-hidden="true"
                      className="text-2xl font-black text-shell-fg-dim transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl pl-[3.25rem] text-sm leading-relaxed text-shell-fg-dim">
                    {item.answer}
                  </p>
                </details>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────────────── */

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
