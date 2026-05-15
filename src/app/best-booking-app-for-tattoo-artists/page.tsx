import type { Metadata } from "next";
import Link from "next/link";
import SiteLogo from "@/components/site-logo";
import {
  MarketingHero,
  DefinitionBlock,
  FeatureBenefitGrid,
  FaqSection,
  RelatedLinksBlock,
  FinalCta,
  PlaceholderVisual,
} from "@/components/marketing";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import type { FaqItem, FeatureBenefitItem, RelatedLink } from "@/lib/marketing";

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
  alternates: {
    canonical: PAGE_PATH,
  },
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

/* ─── Content data ────────────────────────────────────────────────────────── */

type ToolCard = {
  name: string;
  description: string;
  bestFor: string;
  watchOutFor: string;
  fit: string;
};

const TOOLS: ToolCard[] = [
  {
    name: "Inklee",
    description:
      "A tattoo booking request tool built around structured intake, artist review, approvals, deposits, waitlists, and guest spots.",
    bestFor:
      "Solo and traveling tattoo artists who need to review tattoo ideas before approving bookings.",
    watchOutFor:
      "Not meant to replace a full salon POS or large studio management suite.",
    fit: "Tight fit for tattoo workflow.",
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
  },
];

const DECISION_MATRIX: FeatureBenefitItem[] = [
  {
    title: "Solo artist, custom work, Instagram-first",
    description:
      "Best fit: Tattoo intake tool. Why: You need proper requests before you decide what gets booked.",
  },
  {
    title: "Guest spot artist, multiple cities per year",
    description:
      "Best fit: Tattoo intake tool with travel support. Why: City, date, and booking-window context matter more than a generic slot picker.",
  },
  {
    title: "Studio with multiple artists, payments, and POS",
    description:
      "Best fit: Studio management system. Why: A larger team may need scheduling, payments, staff tools, and business operations together.",
  },
  {
    title: "Mostly flash, low custom intake",
    description:
      "Best fit: Simple scheduler or lightweight form. Why: If the design is already clear, the booking process can be simpler.",
  },
  {
    title: "Consultations and calls",
    description:
      "Best fit: Meeting-first scheduler. Why: When the service is just booking a time, a calendar-first tool works well.",
  },
  {
    title: "Just starting out, very low volume",
    description:
      "Best fit: Free form or DIY setup. Why: If you only get a few requests, simple tools may be enough while you learn your process.",
  },
];

const FAQS: FaqItem[] = [
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

const RELATED_LINKS: RelatedLink[] = [
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

/* ─── Header / Footer ─────────────────────────────────────────────────────── */

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

/* ─── Tool list (custom inline section, kept compact + breathable) ────────── */

function ToolList() {
  return (
    <section className="container-marketing py-16 md:py-20">
      <div className="mx-auto max-w-3xl space-y-12 md:space-y-16">
        <header className="space-y-3">
          {/* Decorative slot: replace with small tattoo flash corner asset later */}
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
            Booking tools tattoo artists actually compare
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Each tool has a real strength and a real limit. Read the one that
            sounds closest to your setup first.
          </p>
        </header>
        <div className="space-y-12 md:space-y-14">
          {TOOLS.map((tool) => (
            <article key={tool.name} className="space-y-3">
              <h3 className="text-2xl font-semibold tracking-tight text-foreground">
                {tool.name}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
                {tool.description}
              </p>
              <dl className="space-y-1.5 pt-1 text-sm leading-relaxed">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                  <dt className="font-semibold text-foreground">Best for:</dt>
                  <dd className="text-muted-foreground">{tool.bestFor}</dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                  <dt className="font-semibold text-foreground">
                    Watch out for:
                  </dt>
                  <dd className="text-muted-foreground">{tool.watchOutFor}</dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                  <dt className="font-semibold text-foreground">
                    Fit for tattoo intake:
                  </dt>
                  <dd className="italic text-muted-foreground">{tool.fit}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function BestBookingAppPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <JsonLd
        data={webPageSchema({
          name: PAGE_TITLE,
          url: absoluteUrl(PAGE_PATH),
          description:
            "A fair guide to choosing a booking app for tattoo artists, covering tattoo intake tools, schedulers, forms, and studio systems.",
        })}
        id="ld-webpage"
      />
      <JsonLd data={faqPageSchema(FAQS)} id="ld-faq" />
      <LandingHeader />
      <main className="flex-1">
        <MarketingHero
          eyebrow="Booking app guide"
          heading="Best booking app for tattoo artists"
          subhead="There is no single best booking app for every tattoo artist. The right choice depends on whether you need tattoo intake, simple scheduling, guest spot structure, studio tools, or just a basic form."
          primaryCta={{
            label: "Create your booking link",
            href: "/signup",
          }}
          secondaryCta={{
            label: "See a live example",
            href: "/bert-grimm",
            variant: "secondary",
            external: true,
          }}
          proof="Built by a tattoo artist, for artists who need booking intake before calendar chaos."
          visual={
            <PlaceholderVisual
              label="Placeholder · Booking setup guide"
              caption="Tattoo intake, schedulers, forms, and studio tools side by side"
              aspectRatio="wide"
            />
          }
        />
        <DefinitionBlock
          heading="The real answer depends on your workflow"
          body={[
            "A tattoo artist does not always need the biggest booking platform. Some artists need a simple form. Some need a scheduler. Some need a studio system with payments and POS. And some need a tattoo-specific intake flow because every request starts with an idea, not a time slot.",
            "This guide compares common options honestly. Each tool has a real strength and a real limit. The goal is not to crown one universal winner, but to help artists choose the setup that fits the way they actually book tattoos.",
          ]}
        />
        <ToolList />
        <FeatureBenefitGrid
          heading="Which booking setup fits your situation?"
          items={DECISION_MATRIX}
          columns={2}
        />
        <FaqSection
          eyebrow="FAQ"
          heading="Booking apps for tattoo artists, answered"
          items={FAQS}
        />
        <RelatedLinksBlock
          heading="Go deeper with side by side comparisons"
          links={RELATED_LINKS}
          columns={3}
        />
        {/* Decorative slot: replace with small divider ornament asset later */}
        <FinalCta
          heading="Choose the tool that fits the work"
          subhead="If your tattoo bookings start with ideas, references, placement, and approval decisions, Inklee gives you a cleaner intake flow before the calendar fills up."
          primaryCta={{
            label: "Create your booking link",
            href: "/signup",
          }}
          secondaryCta={{
            label: "See a live example",
            href: "/bert-grimm",
            variant: "secondary",
            external: true,
          }}
        />
      </main>
      <LandingFooter />
    </div>
  );
}
