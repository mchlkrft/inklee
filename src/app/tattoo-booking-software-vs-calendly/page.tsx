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

const PAGE_PATH = "/tattoo-booking-software-vs-calendly";
const PAGE_TITLE = "Tattoo Booking Software vs Calendly | Inklee";
const PAGE_DESCRIPTION =
  "Calendly is great for scheduling, but tattoo intake needs idea-first requests, artist review, deposits, waitlists, and guest spot flow.";
const OG_TITLE = "Tattoo Booking Software vs Calendly";
const OG_DESCRIPTION =
  "See when Calendly works for tattoo artists and when Inklee's tattoo-first request flow makes more sense.";

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
    title: "The slot comes too early",
    description:
      "Calendly lets clients book a time before the artist has properly reviewed the tattoo idea.",
  },
  {
    title: "Tattoo context gets squeezed into notes",
    description:
      "Placement, size, references, body area, and project details do not naturally fit into a meeting-first flow.",
  },
  {
    title: "Approval becomes a workaround",
    description:
      "If the artist still needs to approve the idea manually, the Calendly booking is not really confirmed yet.",
  },
  {
    title: "Guest spots need more context",
    description:
      "City, travel dates, booking windows, and limited availability are hard to manage through a generic scheduling link.",
  },
  {
    title: "Clients may think they are already booked",
    description:
      "When someone picks a slot, they can assume the appointment is real, even if the artist still needs to say yes.",
  },
];

const SOLUTION_POINTS: SolutionPoint[] = [
  {
    title: "Idea-first request flow",
    description:
      "Clients start with the tattoo idea, placement, size, references, description, and timing instead of jumping straight to a calendar slot.",
  },
  {
    title: "Artist approval before confirmation",
    description:
      "The artist stays in control and can approve, reject, or move a request forward after reviewing the actual project.",
  },
  {
    title: "Booking states that match tattoo work",
    description:
      "Requests can move through pending, approved, rejected, deposit pending, waitlist, or cancelled instead of sitting as simple meetings.",
  },
  {
    title: "Deposit-aware process",
    description:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
  {
    title: "Guest spot support",
    description:
      "Traveling artists can organize requests around cities, travel dates, and booking windows instead of forcing every trip into a normal scheduling page.",
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: "Main logic",
    alternative: "Time slot first",
    inklee: "Tattoo idea first",
  },
  {
    feature: "Best use case",
    alternative: "Meetings, calls, fixed services, consultations",
    inklee: "Tattoo requests, artist review, approvals, guest spots",
  },
  {
    feature: "Client starting point",
    alternative: "Pick an available time",
    inklee: "Submit tattoo idea, placement, size, references, and timing",
  },
  {
    feature: "Artist control",
    alternative: "Booking can happen before full project review",
    inklee: "Artist reviews before approving",
  },
  {
    feature: "Tattoo context",
    alternative:
      "Often handled through notes, extra questions, or separate forms",
    inklee: "Built into the booking request flow",
  },
  {
    feature: "Deposits",
    alternative: "Can require external setup or payment configuration",
    inklee:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
  {
    feature: "Guest spots",
    alternative: "Generic scheduling link needs manual workarounds",
    inklee: "City and date-based workflows can support traveling artists",
  },
];

const CALENDLY_USEFUL_CARDS: FeatureBenefitItem[] = [
  {
    title: "Consultation calls",
    description:
      "Calendly can work well when the goal is simply to book a call or studio consultation.",
  },
  {
    title: "Touch-up appointments",
    description:
      "If the tattoo is already approved and the task is clear, scheduling a time slot can be enough.",
  },
  {
    title: "Aftercare check-ins",
    description:
      "Quick follow-up calls or check-ins fit a meeting-style scheduler better than full tattoo intake.",
  },
  {
    title: "Studio-side scheduling",
    description:
      "For staff calendars, internal meetings, or manager-controlled appointments, Calendly can still make sense.",
  },
];

const CALENDLY_WRONG_JOB_CARDS: FeatureBenefitItem[] = [
  {
    title: "You need another intake form before Calendly",
    description:
      "If clients fill out a form first and then book through Calendly, you are already using two tools for one flow.",
  },
  {
    title: "You cancel or move too many bookings",
    description:
      "If clients book slots before you approve the idea, the calendar fills with appointments that are not really confirmed.",
  },
  {
    title: "Important tattoo details live in notes",
    description:
      "If placement, size, references, and project context are buried in small text fields, the system is fighting the work.",
  },
  {
    title: "Guest spots turn into manual sorting",
    description:
      "If each city needs separate links, notes, or spreadsheets, the booking flow is too generic for travel work.",
  },
];

const COMPARE_FAQ: FaqItem[] = [
  {
    question: "Is Calendly good for tattoo artists?",
    answer:
      "Calendly can be useful for tattoo artists when the appointment type is fixed, such as consultations, touch-ups, calls, or aftercare check-ins. It is less suited for tattoo intake, where the artist needs to review the idea before confirming a booking.",
  },
  {
    question: "What is the main difference between Calendly and Inklee?",
    answer:
      "Calendly is built around scheduling time. Inklee is built around tattoo booking requests. Inklee starts with the idea, placement, size, references, and artist review before a booking is approved.",
  },
  {
    question: "Why is slot-first booking a problem for tattoo work?",
    answer:
      "Tattoo bookings usually need project review first. The artist needs to know what the client wants, where it goes, how big it is, whether it fits their style, and whether the timing works before a slot should become a booking.",
  },
  {
    question: "Should tattoo artists stop using Calendly completely?",
    answer:
      "Not necessarily. Calendly can still work for consultation calls, touch-ups, aftercare check-ins, and other fixed appointments. Inklee makes more sense for the tattoo request intake itself.",
  },
  {
    question: "Can Inklee and Calendly be used together?",
    answer:
      "Yes. An artist could use Inklee for tattoo request intake and Calendly for simple calls or already-approved appointments. The key is not to let a calendar slot replace the project review step.",
  },
  {
    question: "Does Inklee replace Instagram?",
    answer:
      "No. Instagram can still be where clients discover the artist. Inklee gives artists a cleaner booking link so tattoo requests do not stay trapped in scattered DMs or generic scheduling flows.",
  },
  {
    question: "Can Inklee handle deposits?",
    answer:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
  {
    question: "Is Inklee only for custom tattoo work?",
    answer:
      "No. Inklee can support different tattoo workflows, but it is especially useful when the artist needs to review requests before approving what gets booked.",
  },
];

const RELATED_LINKS: RelatedLink[] = [
  {
    title: "Inklee vs Google Forms",
    href: "/tattoo-booking-software-vs-google-forms",
    description:
      "Compare generic form intake with a tattoo-specific booking request flow.",
  },
  {
    title: "Tattoo Booking Form",
    href: "/tattoo-booking-form",
    description:
      "See what tattoo artists should collect before saying yes to a booking.",
  },
  {
    title: "Tattoo Booking Software",
    href: "/tattoo-booking-software",
    description:
      "Learn how Inklee helps artists manage requests, approvals, deposits, waitlists, and guest spots.",
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

export default function TattooBookingVsCalendlyPage() {
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
          eyebrow="Calendly vs Inklee"
          heading="Tattoo bookings are not meetings"
          subhead="Calendly is excellent when the time slot is the service. Tattoo booking works differently: the artist needs to review the idea before a date makes sense."
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
          proof="Built by a tattoo artist, for tattoo artists who need idea-first booking, not slot-first scheduling."
          visual={
            <PlaceholderVisual
              label="Placeholder · Calendly vs Inklee comparison"
              caption="Calendar time slots → tattoo request card with idea, references, and approval status"
              aspectRatio="wide"
            />
          }
        />
        <DefinitionBlock
          heading="This is not about Calendly being bad"
          body={[
            "Calendly is a polished scheduling tool. It works well when the service is already clear and the main job is finding a time that fits both calendars.",
            "Tattoo intake is different. A tattoo artist usually needs to review the idea, placement, size, references, style fit, timing, and sometimes deposit or guest spot context before a booking should happen. Inklee is built around that order: idea first, approval next, time slot after.",
          ]}
        />
        <ProblemSolutionBlock
          problemHeading="Where slot-first scheduling breaks down"
          problemBody="Calendly is built to help people book time. That is exactly why it can feel wrong for tattoo intake. In tattooing, the time slot should usually come after the project makes sense."
          problemPoints={PROBLEM_POINTS}
          solutionHeading="Inklee puts the tattoo idea first"
          solutionBody="Inklee reverses the order. Clients send a proper tattoo request first. The artist reviews the project, decides if it fits, and only then moves it toward a real booking."
          solutionPoints={SOLUTION_POINTS}
        />
        <ComparisonTable
          heading="Slot-first scheduling vs idea-first tattoo booking"
          alternativeLabel="Calendly"
          inkleeLabel="Inklee"
          rows={COMPARISON_ROWS}
        />
        <FeatureBenefitGrid
          heading="Where Calendly is actually fine"
          items={CALENDLY_USEFUL_CARDS}
          columns={2}
        />
        <FeatureBenefitGrid
          heading="Signs Calendly is doing the wrong job"
          items={CALENDLY_WRONG_JOB_CARDS}
          columns={2}
        />
        <FaqSection
          eyebrow="FAQ"
          heading="Calendly vs Inklee, answered"
          items={COMPARE_FAQ}
        />
        <RelatedLinksBlock
          heading="Keep comparing tattoo booking options"
          links={RELATED_LINKS}
          columns={3}
        />
        <FinalCta
          heading="Book the tattoo, not just the time"
          subhead="Calendly is great when the service is already clear. Inklee helps tattoo artists collect the idea first, review the request, and turn the right projects into real bookings."
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
