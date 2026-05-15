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

const PAGE_PATH = "/tattoo-deposit-tool";
const PAGE_TITLE = "Tattoo Deposit Tool for Artists | Inklee";
const PAGE_DESCRIPTION =
  "Inklee helps tattoo artists make deposits part of the booking flow with structured requests, approval states, and clearer client handling.";
const OG_TITLE = "Tattoo Deposit Tool for Artists";
const OG_DESCRIPTION =
  "A tattoo-deposit-aware booking flow for artists who want less payment chaos and clearer request handling.";

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
    title: "Payment links get buried in DMs",
    description:
      "When deposit links are sent through chat, the payment context can disappear under new messages and follow-ups.",
  },
  {
    title: "Artists track paid and unpaid manually",
    description:
      "Separate notes or spreadsheets make it easy to lose track of who has paid, who is pending, and who needs a reminder.",
  },
  {
    title: "Clients think the booking is confirmed too early",
    description:
      "If request approval and deposit status are not connected, clients can misunderstand where they are in the process.",
  },
  {
    title: "Policies are explained too late",
    description:
      "Deposit rules, rescheduling expectations, and cancellation notes should be clear before the booking becomes awkward.",
  },
  {
    title: "Guest spots add another layer",
    description:
      "When city, travel dates, and limited booking windows are involved, manual deposit tracking gets even harder to manage.",
  },
];

const SOLUTION_POINTS: SolutionPoint[] = [
  {
    title: "Deposit after artist approval",
    description:
      "The artist can review the tattoo request first, then move the booking into a deposit-related step when it makes sense.",
  },
  {
    title: "Status tied to the booking",
    description:
      "Deposit pending, deposit received, and confirmed booking states are easier to understand when they stay connected to the request.",
  },
  {
    title: "Less separate spreadsheet work",
    description:
      "Artists can avoid rebuilding a paid-vs-unpaid tracker by hand for every approved request.",
  },
  {
    title: "Cleaner client communication",
    description:
      "Clients get a clearer sense of what has been requested, what is pending, and what happens next.",
  },
  {
    title: "Better fit for guest spots",
    description:
      "Deposit status becomes easier to manage when requests are already organized around cities, dates, and booking windows.",
  },
];

const POLICY_ITEMS: FeatureBenefitItem[] = [
  {
    title: "Deposit amount",
    description:
      "State how the deposit amount is calculated or chosen, without turning it into a hidden surprise.",
  },
  {
    title: "What the deposit reserves",
    description:
      "Explain whether the deposit reserves time, design preparation, appointment planning, or another part of the process.",
  },
  {
    title: "Rescheduling rules",
    description:
      "Set clear expectations for what happens if the client needs to move the appointment.",
  },
  {
    title: "No-show rules",
    description:
      "Explain how missed appointments are handled, while keeping local laws and studio policy in mind.",
  },
];

const OUTCOME_ITEMS: FeatureBenefitItem[] = [
  {
    title: "Fewer ghosted bookings",
    description:
      "A deposit step can make the booking feel more real, even though it cannot guarantee every client will show up.",
  },
  {
    title: "Less payment back and forth",
    description:
      "The deposit conversation is easier when it is part of the booking flow instead of another scattered DM thread.",
  },
  {
    title: "Cleaner cancellation talks",
    description:
      "Clear deposit status and policy notes make hard conversations less messy when plans change.",
  },
  {
    title: "Fewer awkward refund DMs",
    description:
      "When expectations are written down early, artists have a clearer starting point for refund and rescheduling questions.",
  },
];

const DEPOSIT_FAQ: FaqItem[] = [
  {
    question: "Should tattoo artists take deposits?",
    answer:
      "Many tattoo artists use deposits to protect time, preparation, and booking commitment. Whether and how you use deposits depends on your workflow, studio policy, and local rules.",
  },
  {
    question: "How much should a tattoo deposit be?",
    answer:
      "There is no universal deposit amount that fits every artist or region. Deposit amounts often depend on project size, appointment length, artist policy, and local expectations.",
  },
  {
    question: "What does a tattoo deposit cover?",
    answer:
      "A deposit can be used to reserve time, support preparation, or confirm commitment, depending on the artist's policy. Artists should explain this clearly before the client pays.",
  },
  {
    question: "Are tattoo deposits refundable?",
    answer:
      "Refundability depends on local law, studio policy, timing, and the specific situation. Artists should avoid vague rules and make their deposit policy clear before payment.",
  },
  {
    question: "What happens to a deposit if the client no-shows?",
    answer:
      "That depends on the artist's policy and local rules. The important part is to explain no-show expectations before the booking is confirmed, not after the problem happens.",
  },
  {
    question: "Can deposits prevent no-shows?",
    answer:
      "Deposits can reduce casual bookings and make clients more committed, but they cannot guarantee that every client will show up.",
  },
  {
    question: "Should the deposit be paid before or after approval?",
    answer:
      "For custom tattoo work, it usually makes sense to review the tattoo request first. Inklee is built around artist approval before moving a request forward in the booking flow.",
  },
  {
    question: "Do I need a separate payment tool for deposits?",
    answer:
      "Some artists use separate payment links or invoices, but that can create extra tracking work. Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
];

const RELATED_LINKS: RelatedLink[] = [
  {
    title: "Tattoo Booking Software",
    href: "/tattoo-booking-software",
    description:
      "See how Inklee helps tattoo artists manage requests, approvals, deposits, waitlists, and guest spots.",
  },
  {
    title: "Tattoo Booking Form",
    href: "/tattoo-booking-form",
    description:
      "Learn what details a tattoo request form should collect before an artist says yes.",
  },
  {
    title: "Inklee vs Google Forms",
    href: "/tattoo-booking-software-vs-google-forms",
    description:
      "Compare basic form intake with a tattoo-specific booking request workflow.",
  },
  {
    title: "Tattoo Deposit Policy Template",
    href: "https://github.com/mchlkrft/tattoo-booking-form-template/blob/main/docs/tattoo-deposit-policy-template.md",
    description:
      "A longer public template artists can adapt when writing their own deposit policy.",
    external: true,
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

export default function TattooDepositToolPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <JsonLd
        data={webPageSchema({
          name: PAGE_TITLE,
          url: absoluteUrl(PAGE_PATH),
          description:
            "A tattoo deposit tool and deposit-aware booking workflow page for tattoo artists who want deposits connected to the booking request, not scattered across DMs, separate payment apps, and spreadsheets.",
        })}
        id="ld-webpage"
      />
      <JsonLd data={faqPageSchema(DEPOSIT_FAQ)} id="ld-faq" />
      <LandingHeader />
      <main className="flex-1">
        <MarketingHero
          eyebrow="Deposit-aware booking"
          heading="Tattoo deposits without the chaos"
          subhead="Deposits should not live in random DMs, separate payment links, and forgotten spreadsheets. Inklee helps make deposits part of the tattoo booking flow after the artist has reviewed the request."
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
          proof="Built by a tattoo artist, for artists who want booking structure before payment confusion."
          visual={
            <PlaceholderVisual
              label="Placeholder · Deposit-aware booking flow"
              caption="Approved request → deposit pending → deposit received → booking confirmed"
              aspectRatio="wide"
            />
          }
        />
        <DefinitionBlock
          heading="What a tattoo deposit tool actually does"
          body={[
            "A tattoo deposit tool is not just a payment link. For tattoo artists, the deposit should connect to the request, the approval decision, the client details, and the booking state.",
            "When deposits live outside the booking flow, artists end up checking DMs, payment apps, invoices, and spreadsheets just to know whether a booking is actually moving forward. Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
          ]}
        />
        <ProblemSolutionBlock
          problemHeading="Where tattoo deposits get messy"
          problemBody="Deposits are supposed to create clarity. But when they sit outside the booking process, they often become another admin job."
          problemPoints={PROBLEM_POINTS}
          solutionHeading="A cleaner deposit-aware booking flow"
          solutionBody="Inklee keeps deposits connected to the booking request instead of treating payment as a separate side conversation."
          solutionPoints={SOLUTION_POINTS}
        />
        {/* Decorative slot: replace with small receipt or coin line-art asset near deposit policy block */}
        <FeatureBenefitGrid
          heading="What a tattoo deposit policy should cover"
          items={POLICY_ITEMS}
          columns={2}
        />
        <FeatureBenefitGrid
          heading="When deposits help you stay calm"
          items={OUTCOME_ITEMS}
          columns={2}
        />
        <FaqSection
          eyebrow="FAQ"
          heading="Tattoo deposits, answered"
          items={DEPOSIT_FAQ}
        />
        <RelatedLinksBlock
          heading="Go deeper into the booking workflow"
          links={RELATED_LINKS}
          columns={2}
        />
        {/* Decorative slot: replace with small booking link card or receipt corner ornament near final CTA */}
        <FinalCta
          heading="Make deposits part of the booking flow"
          subhead="Inklee helps tattoo artists collect proper requests, review before approval, and keep deposit status connected to the booking instead of scattered across DMs and spreadsheets."
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
