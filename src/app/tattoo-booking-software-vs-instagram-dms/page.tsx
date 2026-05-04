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
  PlaceholderVisual,
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

const PAGE_PATH = "/tattoo-booking-software-vs-instagram-dms";
const PAGE_TITLE = "Tattoo Booking Tool vs Instagram DMs · Inklee";
const PAGE_DESCRIPTION =
  "Instagram DMs are good for chats, not tattoo booking structure. Compare DMs with a booking tool built for tattoo requests.";
const OG_TITLE = "Instagram DMs vs a tattoo booking tool";
const OG_DESCRIPTION =
  "See why tattoo artists use Instagram for attention, but move serious booking requests into a structured Inklee flow.";

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
    title: "Clients send “how much?” without enough context",
    description:
      "The price question lands first, before idea, placement, or size. You ask back. They answer tomorrow. Nothing moves.",
  },
  {
    title: "Reference images get separated from the actual idea",
    description:
      "A screenshot in one thread, a description in another, and a question in a third — three pieces of the same request, scattered.",
  },
  {
    title: "Serious requests sit next to reactions, memes, and casual chats",
    description:
      "A real tattoo inquiry shares the inbox with story replies, voice notes, and people just saying hello.",
  },
  {
    title: "Guest spot requests mix with local requests",
    description:
      "Berlin, your home studio, and last year's trip all live in the same DM list — sorting them turns into manual admin.",
  },
  {
    title: "Artists repeat the same intake questions again and again",
    description:
      "Placement, size, references, timing, contact. Same questions, copy-pasted into a different DM, every single week.",
  },
  {
    title: "Good requests disappear because the next step is unclear",
    description:
      "When the path from “I'm interested” to “send your request” is fuzzy, motivated clients lose momentum before anything is booked.",
  },
];

const SOLUTION_POINTS: SolutionPoint[] = [
  {
    title: "One link for bio, stories, replies, and booking prompts",
    description:
      "A single Inklee link covers every place clients already look. No more “DM me to book” without a clear next step.",
  },
  {
    title:
      "Tattoo request form for idea, placement, size, references, and timing",
    description:
      "The structured form gathers the basics before the conversation even starts.",
  },
  {
    title: "Artist review before anything becomes a booking",
    description:
      "Decide whether the idea fits before any time slot is offered. The form is the first step, not the last.",
  },
  {
    title: "Cleaner overview for guest spots and future demand",
    description:
      "Travel requests stay tagged to a city and trip window. Future demand stays visible after a city fills up.",
  },
  {
    title: "Less repeated admin inside DMs",
    description:
      "Stop typing the same intake questions into different threads. The form does it once, every time.",
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: "First contact",
    alternative: "Fast, familiar, and already where clients are",
    inklee: "Starts from Instagram, then moves serious requests into structure",
  },
  {
    feature: "Request details",
    alternative: "Spread across multiple messages",
    inklee: "Collected in one tattoo request form",
  },
  {
    feature: "Reference images",
    alternative: "Easy to lose above or below the main message",
    inklee: "Attached to the request context",
  },
  {
    feature: "Artist approval",
    alternative: "Hard to track what is ready, answered, or still missing",
    inklee: "Artist reviews before confirming anything",
  },
  {
    feature: "Guest spots",
    alternative: "City and travel requests mix with normal chats",
    inklee: "Easier to separate city demand and trip-specific requests",
  },
  {
    feature: "Waitlist",
    alternative: "Future demand disappears after books close",
    inklee: "Requests and waitlist interest stay easier to read",
  },
  {
    feature: "Client next step",
    alternative: "Often unclear unless the artist manually explains it",
    inklee: "One clear request link for serious inquiries",
  },
];

const DM_USEFUL_CARDS: FeatureBenefitItem[] = [
  {
    title: "Use DMs for trust",
    description:
      "Quick questions, vibe checks, and casual replies can stay in Instagram.",
  },
  {
    title: "Use posts and stories for attention",
    description:
      "Instagram is still the place where clients discover your work and learn when books open.",
  },
  {
    title: "Use a booking link for serious requests",
    description:
      "When someone wants to book, the link collects the details you need before you answer properly.",
  },
  {
    title: "Use Inklee for request structure",
    description:
      "The request stays organized enough to review, approve, waitlist, or follow up.",
  },
];

const DM_OVERLOAD_CARDS: FeatureBenefitItem[] = [
  {
    title: "You ask the same questions every week",
    description:
      "Placement, size, references, dates, and contact details should not need to be rebuilt from scratch every time.",
  },
  {
    title: "You lose track of serious clients",
    description:
      "When good requests sit between reactions and casual messages, follow-up gets messy.",
  },
  {
    title: "You cannot read demand clearly",
    description:
      "Closed books, waitlists, and guest spots are hard to judge when everything is just a chat thread.",
  },
  {
    title: "You confirm too late or too early",
    description:
      "Without structure, requests stay vague for too long or move toward booking before the idea is clear.",
  },
];

const COMPARE_FAQ: FaqItem[] = [
  {
    question: "Are Instagram DMs enough for tattoo bookings?",
    answer:
      "Instagram DMs can work when request volume is low and every client gives clear details. Once you deal with missing references, repeated questions, guest spots, or closed books, DMs usually stop being enough.",
  },
  {
    question: "Should tattoo artists stop using Instagram DMs?",
    answer:
      "No. Instagram DMs are still useful for conversation, trust, and quick replies. The better move is to keep DMs for talking and use a booking link for serious tattoo requests.",
  },
  {
    question: "What is the problem with tattoo DM booking?",
    answer:
      "Tattoo DM booking gets messy because the request details often arrive out of order. The idea, placement, size, references, dates, and contact information can get split across multiple messages or buried under newer chats.",
  },
  {
    question: "How does a booking link help with Instagram requests?",
    answer:
      "A booking link gives serious clients one clear next step. Instead of sending half the details in DMs, they submit the request through a form so the artist can review everything in one place.",
  },
  {
    question: "Is Inklee replacing Instagram?",
    answer:
      "No. Inklee works with Instagram. Clients can still find you through posts, stories, highlights, and DMs. Inklee handles the structured booking request after the client is serious enough to ask.",
  },
  {
    question: "What details should move out of DMs?",
    answer:
      "The tattoo idea, placement, size, reference images, preferred timing, contact details, guest spot city, and any notes the artist needs for review should move into a structured request.",
  },
  {
    question: "Is a booking tool too formal for tattoo artists?",
    answer:
      "Not if it is written in the artist's voice. A clean request flow can feel professional without sounding corporate, and it saves both the artist and the client from unnecessary back-and-forth.",
  },
  {
    question: "When should I move from DMs to a booking link?",
    answer:
      "Move when you keep repeating intake questions, losing requests, missing references, or struggling to tell which inquiries are serious. The booking link does not need to replace the conversation. It just gives serious requests structure.",
  },
];

const RELATED_LINKS: RelatedLink[] = [
  {
    title: "Tattoo booking tool for artists",
    href: "/tattoo-booking-software",
    description:
      "See the broader booking tool page and how Inklee fits tattoo workflows.",
  },
  {
    title: "Instagram booking link for tattoo artists",
    href: "/instagram-booking-link-for-tattoo-artists",
    description:
      "Turn Instagram bio clicks and DM replies into structured tattoo requests.",
  },
  {
    title: "Tattoo booking form",
    href: "/tattoo-booking-form",
    description:
      "See what a tattoo request form should collect before the artist replies.",
  },
];

/* ─── Header / Footer ─────────────────────────────────────────────────────── */

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

export default function TattooBookingVsInstagramDmsPage() {
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
      <JsonLd data={faqPageSchema(COMPARE_FAQ)} id="ld-faq" />
      <LandingHeader />
      <main className="flex-1">
        <MarketingHero
          eyebrow="Tattoo booking tool vs Instagram DMs"
          heading="Instagram DMs are not a booking system"
          subhead="Keep Instagram for attention and conversation. Move serious tattoo requests into a structured flow before the idea, placement, references, and timing disappear in the scroll."
          primaryCta={{
            label: "Create your booking link",
            href: "/signup",
          }}
          secondaryCta={{
            label: "See the DM chaos page",
            href: "/dm-chaos",
            variant: "secondary",
          }}
          proof="Built for solo artists, Instagram requests, and approval-first tattoo booking flows."
          visual={
            <PlaceholderVisual
              label="Product preview placeholder"
              caption="Instagram chat → booking link → structured tattoo request"
              aspectRatio="wide"
            />
          }
        />
        <div className="h-[15px] bg-brand-rosa" />
        <DefinitionBlock
          eyebrow="The real comparison"
          heading="DMs start the conversation. They should not hold the whole booking."
          body={[
            "Instagram DMs are useful because clients already use them. They are quick, familiar, and good for building trust. The problem is that tattoo requests need more than a casual message thread.",
            "A serious tattoo request needs the idea, placement, size, references, timing, contact details, and artist approval. Inklee gives that request a cleaner place to land while Instagram stays the front door.",
          ]}
        />
        <ProblemSolutionBlock
          problemHeading="Where Instagram DMs break down"
          problemBody="DMs are built for conversation, not intake. Once a tattoo request needs references, dates, size, placement, and follow-up, the thread can turn into admin work fast."
          problemPoints={PROBLEM_POINTS}
          solutionHeading="A booking link turns interest into a real request."
          solutionBody="With Inklee, artists can keep Instagram as the place where people find them, then send serious clients to one booking link where the important details are collected properly."
          solutionPoints={SOLUTION_POINTS}
        />
        <ComparisonTable
          heading="Instagram DMs vs a tattoo booking flow"
          intro="Instagram is not the enemy. It is just not built to manage tattoo requests from first message to booking decision."
          alternativeLabel="Instagram DMs"
          inkleeLabel="Inklee booking flow"
          rows={COMPARISON_ROWS}
          note="The point is not to stop talking to clients. The point is to stop making DMs carry every booking detail."
        />
        <FeatureBenefitGrid
          heading="When DMs are still useful"
          intro="This page is not saying tattoo artists should leave Instagram. The better setup is knowing which job DMs should do and which job they should not do."
          items={DM_USEFUL_CARDS}
          columns={2}
        />
        <FeatureBenefitGrid
          heading="Signs your DMs are doing too much"
          intro="You probably do not need a heavier system because you love software. You need one because the same booking problems keep repeating."
          items={DM_OVERLOAD_CARDS}
          columns={2}
        />
        <div className="h-[15px] bg-brand-red" />
        <FaqSection
          eyebrow="FAQ"
          heading="Instagram DMs vs Inklee, answered"
          items={COMPARE_FAQ}
        />
        <RelatedLinksBlock
          heading="More ways to clean up tattoo requests"
          intro="Keep the booking flow connected with three more reads on how Inklee fits the way tattoo artists actually work."
          links={RELATED_LINKS}
          columns={3}
        />
        <FinalCta
          heading="Keep Instagram. Stop booking from the chaos."
          subhead="Give serious clients one link for the tattoo details you actually need."
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
