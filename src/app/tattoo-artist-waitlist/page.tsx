import type { Metadata } from "next";
import Link from "next/link";
import SiteLogo from "@/components/site-logo";
import {
  MarketingHero,
  DefinitionBlock,
  ProblemSolutionBlock,
  FeatureBenefitGrid,
  FaqSection,
  RelatedLinksBlock,
  FinalCta,
  PlaceholderVisual,
} from "@/components/marketing";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import type {
  FaqItem,
  FeatureBenefitItem,
  ProblemPoint,
  RelatedLink,
  SolutionPoint,
} from "@/lib/marketing";

const PAGE_PATH = "/tattoo-artist-waitlist";
const PAGE_TITLE = "Tattoo Artist Waitlist Tool | Inklee";
const PAGE_DESCRIPTION =
  "Inklee helps tattoo artists keep future demand organized with structured waitlists for closed books, guest spots, and booking waves.";
const OG_TITLE = "Tattoo Artist Waitlist Tool";
const OG_DESCRIPTION =
  "Keep future tattoo requests visible when books are closed, guest spots fill up, or clients need to wait for the next booking window.";

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
    title: "Good requests disappear in DMs",
    description:
      "When books are closed, serious clients still message you, but their requests can get buried before you are ready to reopen.",
  },
  {
    title: "No useful request context",
    description:
      "A name on a list is not enough if you cannot remember the idea, placement, size, references, or timing later.",
  },
  {
    title: "Guest spot demand gets mixed up",
    description:
      "Requests from different cities become hard to compare when every location lives in the same inbox or spreadsheet.",
  },
  {
    title: "No clear follow-up status",
    description:
      "Without status tracking, it is easy to forget who was contacted, who replied, and who already moved forward.",
  },
  {
    title: "Demand disappears after books reopen",
    description:
      "If the waitlist is not connected to the booking flow, the next booking window starts from chaos again.",
  },
];

const SOLUTION_POINTS: SolutionPoint[] = [
  {
    title: "Structured waitlist entries",
    description:
      "Clients can leave useful request details instead of sending vague “let me know when books open” messages.",
  },
  {
    title: "Request context stays visible",
    description:
      "Idea, placement, size, references, contact details, and timing stay easier to review when the artist comes back later.",
  },
  {
    title: "Cleaner books closed flow",
    description:
      "When books are closed, artists can still collect future interest without pretending every request can be booked right now.",
  },
  {
    title: "Better guest spot planning",
    description:
      "Waitlist demand can help artists understand which cities have serious interest before planning another trip.",
  },
  {
    title: "Easier follow-up later",
    description:
      "Status handling makes it easier to see who is waiting, who was contacted, and which requests might move forward.",
  },
];

const FIELDS_ITEMS: FeatureBenefitItem[] = [
  {
    title: "Tattoo idea",
    description:
      "The waitlist should capture what the client actually wants, not just their name and contact.",
  },
  {
    title: "Placement and size",
    description:
      "Body area and rough size help the artist judge whether the request fits future availability.",
  },
  {
    title: "References",
    description:
      "Reference images or links make the request easier to understand when the artist reviews it later.",
  },
  {
    title: "City and timing",
    description:
      "For guest spots and travel artists, location and date context can make waitlist demand much more useful.",
  },
];

const SCENARIO_ITEMS: FeatureBenefitItem[] = [
  {
    title: "Books are closed",
    description:
      "Artists can collect future interest without turning the inbox into a pile of unread booking requests.",
  },
  {
    title: "Guest spot is full",
    description:
      "Clients who missed the current city window can still stay visible for the next trip.",
  },
  {
    title: "Demand by city",
    description:
      "Traveling artists can see where people are waiting before deciding where to go next.",
  },
  {
    title: "Long lead times",
    description:
      "Artists with bigger projects or limited availability can keep future requests organized instead of losing them.",
  },
];

const WAITLIST_FAQ: FaqItem[] = [
  {
    question: "Should tattoo artists have a waitlist?",
    answer:
      "A waitlist can help when an artist gets more serious requests than they can book right now. It keeps future demand visible instead of letting good requests disappear in DMs.",
  },
  {
    question: "What is the difference between a waitlist and saved DMs?",
    answer:
      "Saved DMs are still scattered chats. A useful tattoo waitlist keeps request details, contact information, timing, and status together so the artist can review them later.",
  },
  {
    question: "How do guest spots affect waitlist needs?",
    answer:
      "Guest spots create city-based demand. A waitlist can help artists see who is interested in a specific location after the current booking window is full.",
  },
  {
    question: "How long should I keep someone on a tattoo waitlist?",
    answer:
      "That depends on your workflow, booking windows, and client communication style. The important part is to set expectations clearly so clients know what waiting means.",
  },
  {
    question: "Should I contact waitlist entries in order?",
    answer:
      "Not always. Some artists work by order, while others choose based on style fit, project size, location, or available dates. The process should match your booking policy.",
  },
  {
    question: "What happens when my books reopen?",
    answer:
      "When books reopen, the artist can review waitlist entries, contact suitable clients, and move the right requests forward instead of starting from a messy inbox.",
  },
  {
    question: "Can a waitlist help me decide where to travel next?",
    answer:
      "Yes. For guest spot artists, city-based waitlist demand can show where people are interested before planning another trip.",
  },
  {
    question: "Do I need a separate waitlist tool?",
    answer:
      "A separate list can work at low volume, but it often becomes messy. Inklee keeps waitlist interest connected to tattoo requests, booking states, and guest spot context.",
  },
];

const RELATED_LINKS: RelatedLink[] = [
  {
    title: "Guest Spot Booking",
    href: "/guest-spot-booking",
    description:
      "See how Inklee helps traveling artists organize requests around cities, dates, and booking windows.",
  },
  {
    title: "Tattoo Deposit Tool",
    href: "/tattoo-deposit-tool",
    description:
      "Learn how deposit status can stay connected to the booking flow instead of scattered across DMs.",
  },
  {
    title: "Tattoo Booking Form",
    href: "/tattoo-booking-form",
    description:
      "See what details a tattoo request form should collect before an artist says yes.",
  },
  {
    title: "Tattoo Booking Software",
    href: "/tattoo-booking-software",
    description:
      "Learn how Inklee helps tattoo artists manage requests, approvals, deposits, waitlists, and guest spots.",
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

export default function TattooArtistWaitlistPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <JsonLd
        data={webPageSchema({
          name: PAGE_TITLE,
          url: absoluteUrl(PAGE_PATH),
          description:
            "A tattoo artist waitlist and booking request workflow page for freelance and traveling tattoo artists who want future demand connected to the booking flow, not scattered across DMs and spreadsheets.",
        })}
        id="ld-webpage"
      />
      <JsonLd data={faqPageSchema(WAITLIST_FAQ)} id="ld-faq" />
      <LandingHeader />
      <main className="flex-1">
        <MarketingHero
          eyebrow="Waitlist for tattoo artists"
          heading="Keep future tattoo requests visible"
          subhead="When your books are closed or a guest spot fills up, serious requests should not disappear into DMs. Inklee helps keep future demand organized as part of your booking flow."
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
          proof="Built by a tattoo artist, for artists who need more than a folder of saved DMs."
          visual={
            <PlaceholderVisual
              label="Placeholder · Waitlist flow"
              caption="Books closed → join waitlist → waiting → contacted → converted to booking"
              aspectRatio="wide"
            />
          }
        />
        <DefinitionBlock
          heading="What a tattoo waitlist actually does"
          body={[
            "A tattoo waitlist is not just a list of people who sent DMs while your books were closed. It should keep useful request details visible so you can come back to serious clients when the timing makes sense.",
            "For tattoo artists, a waitlist works best when it stays connected to the booking request: idea, placement, size, references, contact details, city, travel dates, and status. Inklee keeps waitlist demand inside the booking flow instead of pushing it into screenshots, spreadsheets, or memory.",
          ]}
        />
        <ProblemSolutionBlock
          problemHeading="Where informal waitlists break down"
          problemBody="Saved DMs and manual lists feel fine until the next booking wave starts. Then future demand gets messy fast."
          problemPoints={PROBLEM_POINTS}
          solutionHeading="A waitlist built into the booking flow"
          solutionBody="Inklee keeps future demand connected to real request details, so artists can reopen books, plan guest spots, and follow up with more clarity."
          solutionPoints={SOLUTION_POINTS}
        />
        <FeatureBenefitGrid
          heading="What a tattoo waitlist should capture"
          items={FIELDS_ITEMS}
          columns={2}
        />
        {/* Decorative slot: replace with small list or map-pin line-art asset near the guest spot context */}
        <FeatureBenefitGrid
          heading="When a waitlist actually helps"
          items={SCENARIO_ITEMS}
          columns={2}
        />
        <FaqSection
          eyebrow="FAQ"
          heading="Tattoo artist waitlists, answered"
          items={WAITLIST_FAQ}
        />
        <RelatedLinksBlock
          heading="Go deeper into the booking workflow"
          links={RELATED_LINKS}
          columns={2}
        />
        {/* Decorative slot: replace with small booking link card with "waitlist open" status near final CTA */}
        <FinalCta
          heading="Stop losing future bookings in DMs"
          subhead="Inklee helps tattoo artists collect structured requests, keep future demand visible, and move the right waitlist entries forward when books reopen."
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
