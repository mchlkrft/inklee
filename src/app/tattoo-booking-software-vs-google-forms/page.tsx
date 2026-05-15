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

const PAGE_PATH = "/tattoo-booking-software-vs-google-forms";
const PAGE_TITLE = "Tattoo Booking Software vs Google Forms | Inklee";
const PAGE_DESCRIPTION =
  "Google Forms can collect tattoo requests, but Inklee adds approval flow, booking states, deposits, waitlists, and guest spot structure.";
const OG_TITLE = "Tattoo Booking Software vs Google Forms";
const OG_DESCRIPTION =
  "See when Google Forms is enough and when tattoo artists need a structured booking request flow built for real tattoo work.";

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
    title: "No tattoo-specific request flow",
    description:
      "Google Forms can ask custom questions, but it does not understand tattoo intake, artist review, booking status, or what happens after a request comes in.",
  },
  {
    title: "Responses end up in a spreadsheet",
    description:
      "A spreadsheet can store answers, but it does not give artists a clean booking overview with pending, approved, rejected, waitlist, or deposit-related states.",
  },
  {
    title: "References feel disconnected",
    description:
      "Clients can upload files or paste links, but references often end up feeling separate from the full tattoo idea instead of part of one reviewable request.",
  },
  {
    title: "No real approval workflow",
    description:
      "Google Forms collects submissions, but it does not give tattoo artists a native way to review, approve, reject, or move a request forward as a booking.",
  },
  {
    title: "Guest spots get messy fast",
    description:
      "When cities, travel dates, and booking windows enter the picture, a basic form can become another manual sorting job.",
  },
];

const SOLUTION_POINTS: SolutionPoint[] = [
  {
    title: "Structured tattoo requests",
    description:
      "Clients submit the details artists actually need, including idea, placement, size, description, references, images, timing, and contact information.",
  },
  {
    title: "Artist review before approval",
    description:
      "Requests do not become bookings automatically. Artists can review the idea first and decide what should move forward.",
  },
  {
    title: "Booking states that make sense",
    description:
      "Requests can move through states like pending, approved, rejected, deposit pending, waitlist, or cancelled instead of getting buried in a spreadsheet.",
  },
  {
    title: "Deposit-aware workflow",
    description:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
  {
    title: "Guest spot structure",
    description:
      "Traveling artists can organize requests around cities, dates, and booking windows instead of forcing guest spot planning into one general form.",
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: "Tattoo request intake",
    alternative: "Custom questions can collect basic answers",
    inklee:
      "Built around tattoo ideas, placement, size, references, images, and timing",
  },
  {
    feature: "Artist approval",
    alternative: "No native booking approval flow",
    inklee: "Artists review before approving or rejecting",
  },
  {
    feature: "Booking status",
    alternative: "Usually managed manually in Sheets",
    inklee: "Requests move through booking-specific states",
  },
  {
    feature: "References and uploads",
    alternative: "Files or links can be attached, but review is manual",
    inklee: "References stay connected to the request context",
  },
  {
    feature: "Deposits",
    alternative: "Requires external setup and manual tracking",
    inklee:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
  {
    feature: "Guest spots",
    alternative: "Requires separate forms, sheets, or manual sorting",
    inklee: "City and date-based workflows can support traveling artists",
  },
  {
    feature: "Client experience",
    alternative: "Functional, but generic and lightly branded",
    inklee: "Public booking page built for tattoo request intake",
  },
];

const FORMS_USEFUL_CARDS: FeatureBenefitItem[] = [
  {
    title: "Very low request volume",
    description:
      "If you only get a few requests per month, a simple form may be enough for basic intake.",
  },
  {
    title: "Temporary testing",
    description:
      "Google Forms can work when you only want to test which questions clients should answer before building a proper booking flow.",
  },
  {
    title: "Simple contact collection",
    description:
      "If you only need names, emails, and one message field, Google Forms can do the job.",
  },
  {
    title: "Non-booking surveys",
    description:
      "For feedback, polls, or general research, Google Forms is still a practical tool.",
  },
];

const FORMS_OVERLOAD_CARDS: FeatureBenefitItem[] = [
  {
    title: "You live inside the response spreadsheet",
    description:
      "If most of your booking work happens after export or inside Sheets, the form is no longer enough.",
  },
  {
    title: "You manually mark every request status",
    description:
      "If you are creating your own pending, approved, rejected, and deposit columns, you are rebuilding a booking tool by hand.",
  },
  {
    title: "Clients still DM missing details",
    description:
      "If the form does not reduce back and forth, it is not solving the real problem.",
  },
  {
    title: "Guest spots need separate workarounds",
    description:
      "If every city needs another form, another sheet, or another manual list, the system is starting to fight your workflow.",
  },
];

const COMPARE_FAQ: FaqItem[] = [
  {
    question: "Can tattoo artists use Google Forms for booking requests?",
    answer:
      "Yes. Google Forms can collect basic tattoo request information, especially for artists with low request volume. It becomes limited when artists need approval states, deposit tracking, guest spot structure, waitlists, or a cleaner booking overview.",
  },
  {
    question: "What is the main difference between Google Forms and Inklee?",
    answer:
      "Google Forms collects answers. Inklee is built around the tattoo booking workflow: request intake, artist review, approval decisions, booking states, deposits, waitlists, guest spots, and organized bookings.",
  },
  {
    question: "Is Google Forms bad for tattoo artists?",
    answer:
      "No. Google Forms is not bad. It is just generic. It can work for simple intake, but it was not made specifically for tattoo artists or the way tattoo booking decisions are usually made.",
  },
  {
    question: "Why do tattoo artists outgrow Google Forms?",
    answer:
      "Artists usually outgrow Google Forms when submissions increase, requests need review, references need context, deposit status becomes important, or guest spot bookings need city and date structure.",
  },
  {
    question: "Does Inklee replace Instagram?",
    answer:
      "No. Instagram can still be where clients discover the artist. Inklee gives artists a cleaner booking link so serious requests do not stay trapped in scattered DMs.",
  },
  {
    question: "Does Inklee replace Google Sheets?",
    answer:
      "Inklee can reduce the need to manage tattoo requests through spreadsheets. Instead of manually tracking form responses in rows and columns, artists can review booking requests in a more tattoo-specific flow.",
  },
  {
    question: "Can Inklee handle deposits?",
    answer:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
  {
    question: "Is Inklee only for established tattoo artists?",
    answer:
      "No. Inklee is useful for solo artists, freelance artists, traveling guest spot artists, and growing artists who want more structure before their booking process becomes messy.",
  },
];

const RELATED_LINKS: RelatedLink[] = [
  {
    title: "Tattoo Booking Form",
    href: "/tattoo-booking-form",
    description:
      "See what a tattoo request form should collect before an artist says yes.",
  },
  {
    title: "Inklee vs Instagram DMs",
    href: "/tattoo-booking-software-vs-instagram-dms",
    description:
      "Compare scattered Instagram messages with a structured tattoo booking request flow.",
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

export default function TattooBookingVsGoogleFormsPage() {
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
          eyebrow="Google Forms vs Inklee"
          heading="Google Forms is not tattoo booking"
          subhead="Google Forms can collect answers. Inklee is built to turn tattoo inquiries into structured booking requests, review decisions, deposits, waitlists, guest spots, and organized bookings."
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
          proof="Built by a tattoo artist, for tattoo artists who need more than another spreadsheet."
          visual={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/branding/illustrations/landingpages/hero-google-form-vs-inklee.svg"
              alt="Google Form response in a spreadsheet compared with a structured Inklee tattoo booking request"
              className="block h-auto w-full"
              fetchPriority="high"
              draggable={false}
            />
          }
        />
        <div className="h-[15px] bg-brand-rosa" />
        <DefinitionBlock
          eyebrow="The honest comparison"
          heading="What this comparison is really about"
          body={[
            "Google Forms is free, familiar, and easy to set up. For a new artist with a low number of requests, it can be a simple way to collect basic information instead of asking everything again in Instagram DMs.",
            "The problem starts when the form becomes your whole booking system. Tattoo requests need context, references, placement, size, approval decisions, deposit status, waitlists, and sometimes city-based guest spot planning. Inklee is built for that workflow from the start.",
          ]}
        />
        <ProblemSolutionBlock
          problemHeading="Where Google Forms starts to break"
          problemBody="Google Forms can collect information, but tattoo booking usually needs more than a list of answers. Once requests start piling up, the real work begins after the form is submitted."
          problemPoints={PROBLEM_POINTS}
          solutionHeading="What Inklee adds for tattoo artists"
          solutionBody="Inklee keeps the useful part of a form, but connects it to the actual tattoo booking process. Clients send proper requests, and artists stay in control before anything becomes a confirmed booking."
          solutionPoints={SOLUTION_POINTS}
        />
        <ComparisonTable
          heading="Google Forms vs a tattoo booking flow"
          intro="Google Forms is a real, useful tool. It is just not built for the way tattoo bookings actually work — request review, approval states, deposits, waitlists, and travel-based guest spots."
          alternativeLabel="Google Forms"
          inkleeLabel="Inklee"
          rows={COMPARISON_ROWS}
          note="The point is not to dismiss Google Forms. The point is that a tattoo booking flow needs more than a form and a sheet."
        />
        <FeatureBenefitGrid
          heading="Where Google Forms is actually fine"
          intro="There are real cases where a Google Form is still the right tool. Knowing when to outgrow it matters more than picking a side."
          items={FORMS_USEFUL_CARDS}
          columns={2}
        />
        <FeatureBenefitGrid
          heading="Signs your Google Form is doing too much"
          intro="You probably do not need a heavier system because you love software. You need one because the same booking problems keep repeating."
          items={FORMS_OVERLOAD_CARDS}
          columns={2}
        />
        <div className="h-[15px] bg-brand-red" />
        <FaqSection
          eyebrow="FAQ"
          heading="Google Forms vs Inklee, answered"
          items={COMPARE_FAQ}
        />
        <RelatedLinksBlock
          heading="More ways to clean up tattoo requests"
          intro="Keep the booking flow connected with three more reads on how Inklee fits the way tattoo artists actually work."
          links={RELATED_LINKS}
          columns={3}
        />
        <FinalCta
          heading="Stop running bookings from a form spreadsheet"
          subhead="Google Forms can collect answers. Inklee helps tattoo artists turn requests into reviewable bookings with structure, status, and less back and forth."
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
