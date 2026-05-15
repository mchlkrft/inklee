import type { Metadata } from "next";
import Link from "next/link";
import SiteLogo from "@/components/site-logo";
import {
  MarketingHero,
  DefinitionBlock,
  ProblemSolutionBlock,
  FeatureBenefitGrid,
  ComparisonTable,
  FaqSection,
  RelatedLinksBlock,
  FinalCta,
} from "@/components/marketing";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import type {
  ComparisonRow,
  FaqItem,
  FeatureBenefitItem,
  ProblemPoint,
  RelatedLink,
  SolutionPoint,
} from "@/lib/marketing";

const PAGE_PATH = "/tattoo-booking-software";
const PAGE_TITLE = "Tattoo Booking Tool for Artists · Inklee";
const PAGE_DESCRIPTION =
  "Tattoo booking software without the generic business tool feel. Collect requests, references, approvals, deposits, and guest spots without DM chaos.";
const OG_TITLE = "Tattoo booking software made for tattoo artists";
const OG_DESCRIPTION =
  "Inklee helps solo and traveling artists turn Instagram chats into structured tattoo requests, approvals, and organized bookings.";

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

const PROBLEM_POINTS: ProblemPoint[] = [
  {
    title: "Requests arrive as scattered Instagram chats",
    description:
      "The first message rarely contains everything you need. Details show up across replies, voice notes, and reactions, never in one place.",
  },
  {
    title: "Reference images get separated from the actual idea",
    description:
      "Saved screenshots sit in one thread, the description in another, and you have to piece the request back together before you can answer.",
  },
  {
    title: "Clients skip size, placement, timing, or budget context",
    description:
      "Without a structured prompt, most clients send a vibe instead of a request. You end up asking the same questions every time.",
  },
  {
    title: "Guest spot messages get mixed with regular booking requests",
    description:
      "Berlin questions, your home studio inquiries, and old DMs from last year all sit in the same inbox.",
  },
  {
    title: "Generic schedulers push clients toward picking a time too early",
    description:
      "Most appointment tools assume the service is fixed. Tattoo work is the opposite — the time slot is the last thing you decide, not the first.",
  },
];

const SOLUTION_POINTS: SolutionPoint[] = [
  {
    title: "One booking link for bio, stories, and replies",
    description:
      "Drop a single Inklee link wherever clients already find you. Serious requests land in a structured flow instead of another DM thread.",
  },
  {
    title: "Tattoo-specific request form before the appointment",
    description:
      "Collect idea, placement, size, references, and timing before anyone talks about availability.",
  },
  {
    title: "Approval flow before confirmation",
    description:
      "Review the request first. Approve what fits your work, decline what doesn't, and skip the calendar games until the idea is right.",
  },
  {
    title: "Guest spot and travel-friendly structure",
    description:
      "Organize requests around cities, travel dates, and booking windows so the right idea ends up in the right week.",
  },
  {
    title: "Subtle deposit support where it fits your workflow",
    description:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
];

const CORE_FEATURES: FeatureBenefitItem[] = [
  {
    title: "Tattoo request form",
    description:
      "Collect idea, placement, size, references, preferred timing, and contact details before replying.",
  },
  {
    title: "Booking link for Instagram",
    description:
      "Put one link in your bio, stories, or replies so serious requests land in a structured flow.",
  },
  {
    title: "Approval before confirmation",
    description:
      "Review the idea first. Not every request should instantly become an appointment.",
  },
  {
    title: "Guest spot support",
    description:
      "Organize requests around cities, travel dates, and booking windows instead of mixing everything in one inbox.",
  },
  {
    title: "Waitlist and future demand",
    description:
      "Keep demand visible when books are closed or when you are deciding where to travel next.",
  },
  {
    title: "Deposit-aware flow",
    description:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: "Starting point",
    alternative: "Usually starts with available times",
    inklee: "Starts with the tattoo request",
  },
  {
    feature: "Client details",
    alternative: "Basic contact info and a short note",
    inklee: "Idea, placement, size, references, timing, and contact",
  },
  {
    feature: "Artist control",
    alternative: "Client often books directly",
    inklee: "Artist reviews before confirming",
  },
  {
    feature: "Instagram workflow",
    alternative: "Usually disconnected from chats and bio behavior",
    inklee: "Built around link-in-bio and Instagram-driven requests",
  },
  {
    feature: "Guest spots",
    alternative: "Often needs workarounds",
    inklee: "Designed for travel dates, city demand, and booking windows",
  },
  {
    feature: "Deposits",
    alternative: "Often handled separately or through generic payment settings",
    inklee:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
  {
    feature: "Best fit",
    alternative:
      "Calls, consultations, fixed services, studio-style scheduling",
    inklee: "Solo artists, traveling artists, and tattoo-specific intake",
  },
];

const AUDIENCE_CARDS: FeatureBenefitItem[] = [
  {
    title: "Solo tattoo artists",
    description:
      "For artists who handle their own inquiries and need cleaner request flow without hiring a front desk.",
  },
  {
    title: "Traveling guest spot artists",
    description:
      "For artists moving between cities, studios, and limited booking windows.",
  },
  {
    title: "Artists working from Instagram",
    description:
      "For tattooers who still want Instagram as the front door, just not as the booking system.",
  },
  {
    title: "Not a heavy studio CRM",
    description:
      "Inklee is not trying to replace payroll, staff planning, accounting, or every admin tool a large studio might need.",
  },
];

const SOFTWARE_FAQ: FaqItem[] = [
  {
    question: "What should a tattoo booking tool include?",
    answer:
      "A good tattoo booking tool should collect the idea, placement, size, reference images, preferred timing, contact details, and any information the artist needs before saying yes. The important part is not just scheduling. It is helping the artist decide if the request should become a booking.",
  },
  {
    question: "Why not just use a normal appointment scheduler?",
    answer:
      "Normal appointment schedulers are built for fixed services where the client can pick a time immediately. Tattoo requests usually need review first because the artist needs context, style fit, placement, size, and sometimes preparation before confirming anything.",
  },
  {
    question: "Do I need a booking tool if most clients come from Instagram?",
    answer:
      "That is exactly where a booking tool helps. Instagram can stay the place where people find you and start talking, but serious requests should move into a cleaner flow before details disappear in the chat.",
  },
  {
    question: "Is Inklee better for solo artists or studios?",
    answer:
      "Inklee is currently focused on solo tattoo artists, freelance artists, and traveling guest spot artists. Studios may find parts of it useful, but it is not built as a heavy studio CRM at this stage.",
  },
  {
    question: "Can Inklee help if I do guest spots?",
    answer:
      "Yes. Guest spot work creates extra chaos because requests are tied to cities, dates, studios, and limited booking windows. Inklee is designed to support that kind of travel-based request flow.",
  },
  {
    question: "Can I still talk to clients in DMs?",
    answer:
      "Yes. Inklee does not need to kill the conversation. It just gives you a cleaner place for the actual booking request, so the important details do not stay buried between reactions, voice notes, and casual chat.",
  },
  {
    question: "How should deposits fit into a tattoo booking flow?",
    answer:
      "Deposits should come after the request makes sense, not before the artist has enough context. Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
  {
    question: "Is this meant to replace my whole business setup?",
    answer:
      "No. Inklee is focused on tattoo intake and booking requests. It is not trying to replace every business tool, accounting setup, or studio management system.",
  },
];

const RELATED_LINKS: RelatedLink[] = [
  {
    title: "Instagram booking link for tattoo artists",
    href: "/instagram-booking-link-for-tattoo-artists",
    description:
      "Move serious booking requests from Instagram into a cleaner tattoo request flow.",
  },
  {
    title: "Booking requests without DM chaos",
    href: "/dm-chaos",
    description:
      "See how Inklee moves serious tattoo requests out of messy Instagram chats.",
  },
  {
    title: "Guest spot booking for traveling artists",
    href: "/guest-spot-booking",
    description:
      "Organize city demand, travel dates, and guest spot requests without DM chaos.",
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

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function TattooBookingSoftwarePage() {
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
      <JsonLd data={faqPageSchema(SOFTWARE_FAQ)} id="ld-faq" />
      <LandingHeader />
      <main className="flex-1">
        <MarketingHero
          eyebrow="Tattoo booking tool for artists"
          heading="Tattoo booking tool built for tattoo artists"
          subhead="Inklee turns Instagram chats and inquiries into structured tattoo requests, so solo and traveling artists can review the idea before it becomes a booking."
          primaryCta={{
            label: "Create your booking link",
            href: "/signup",
          }}
          secondaryCta={{
            label: "See how it fixes DM chaos",
            href: "/dm-chaos",
            variant: "secondary",
          }}
          proof="Built for solo artists, guest spots, and Instagram-first booking flows."
          visual={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/branding/illustrations/landingpages/hero-dm-questions.svg"
              alt="Tattoo client questions in Instagram DMs replaced by a structured tattoo booking request"
              className="block h-auto w-full"
              fetchPriority="high"
              draggable={false}
            />
          }
        />
        <div className="h-[15px] bg-brand-rosa" />
        <DefinitionBlock
          eyebrow="Tattoo booking software, translated for real tattoo work"
          heading="A booking tool is only useful if it understands the request."
          body={[
            "For tattoo artists, booking is not just putting a name into a calendar. Before a client gets a spot, you usually need the idea, placement, size, references, timing, and enough context to decide if the piece fits your work.",
            "That is where Inklee fits. It gives solo and traveling artists a booking link, tattoo request form, and approval flow built around the messy first step between “I want a tattoo” and “yes, this should become an appointment.”",
          ]}
        />
        <ProblemSolutionBlock
          problemHeading="Generic tools start with the slot. Tattoo artists start with the idea."
          problemBody="Most appointment tools assume the service is already clear. Tattooing does not work like that. A client might send half an idea, three screenshots, no placement, and ask for a price before you know if the piece even makes sense."
          problemPoints={PROBLEM_POINTS}
          solutionHeading="Inklee helps you decide what should actually get booked."
          solutionBody="Inklee moves serious requests into a structured flow. Clients send the details first, then the artist reviews the request, approves what fits, and keeps the next steps organized."
          solutionPoints={SOLUTION_POINTS}
        />
        <FeatureBenefitGrid
          heading="What tattoo artists actually need from a booking tool"
          intro="Tattoo bookings are not the same as haircuts, calls, or dentist appointments. The tool has to respect how artists decide what gets booked."
          items={CORE_FEATURES}
          columns={3}
        />
        <ComparisonTable
          heading="Generic appointment tools vs a tattoo-first booking tool"
          intro="Generic tools are not useless. They work well when the service is fixed and the client can simply choose a time. Tattoo requests need more context before a time slot even matters."
          alternativeLabel="Generic appointment tools"
          inkleeLabel="Inklee"
          rows={COMPARISON_ROWS}
          note="Inklee is not trying to become a heavy studio management system. It focuses on the first messy part: turning tattoo interest into organized booking requests."
        />
        <div className="h-[15px] bg-brand-red" />
        <FeatureBenefitGrid
          heading="Built for artists who choose what gets booked"
          items={AUDIENCE_CARDS}
          columns={2}
        />
        <FaqSection
          eyebrow="FAQ"
          heading="Tattoo booking software, answered"
          items={SOFTWARE_FAQ}
        />
        <RelatedLinksBlock
          heading="Go deeper into the booking workflow"
          intro="Keep building the booking flow with three more reads on how Inklee fits the way tattoo artists actually work."
          links={RELATED_LINKS}
          columns={3}
        />
        <FinalCta
          heading="Stop forcing tattoo requests through generic tools."
          subhead="Create a booking link that collects the right details before the booking starts."
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
