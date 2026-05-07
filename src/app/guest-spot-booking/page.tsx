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

const PAGE_PATH = "/guest-spot-booking";
const PAGE_TITLE = "Guest Spot Booking Tool for Tattoo Artists · Inklee";
const PAGE_DESCRIPTION =
  "Organize tattoo guest spot booking requests by city, travel dates, client details, references, and waitlists without DM chaos.";
const OG_TITLE = "Guest spot bookings without the DM mess";
const OG_DESCRIPTION =
  "Inklee helps traveling tattoo artists collect guest spot requests, city demand, travel dates, and client details in one cleaner flow.";

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
    title: "Requests from different cities land in the same inbox",
    description:
      "Berlin asks about your spring trip, London asks about last year's, and someone DMs you for a city you have not even confirmed yet — all in the same thread.",
  },
  {
    title: "Clients forget to mention city, travel dates, placement, or size",
    description:
      "Without a structured prompt, half the requests are missing the one piece of context you actually need to decide if the trip fits.",
  },
  {
    title: "Guest spot announcements create interest but no clean overview",
    description:
      "A story drives a wave of replies, then the wave moves down the inbox and you have no usable list of who wants what.",
  },
  {
    title: "Good requests disappear under casual DMs and story replies",
    description:
      "The serious traveling-client request ends up sitting under three reactions, a sticker reply, and a question about your work.",
  },
  {
    title: "It is hard to judge demand before planning the next trip",
    description:
      "Without a way to see city interest in one place, planning where to travel next becomes a guess rather than a decision.",
  },
];

const SOLUTION_POINTS: SolutionPoint[] = [
  {
    title:
      "Collect guest spot requests from Instagram bio, stories, and replies",
    description:
      "One Inklee link covers every surface where clients see your travel announcement and ask to book.",
  },
  {
    title: "Ask for city, timing, tattoo idea, placement, size, and references",
    description:
      "Every request lands with the same structured details, so you can compare requests side by side instead of digging through chats.",
  },
  {
    title: "Separate travel demand from regular booking noise",
    description:
      "Guest spot requests stay tagged to a city and trip window, so they do not get tangled up with home-studio inquiries.",
  },
  {
    title: "Review requests before confirming anything",
    description:
      "Decide whether the idea fits your work, the available time, and the trip context before any slot is offered.",
  },
  {
    title: "Keep waitlist and future city demand easier to understand",
    description:
      "When a trip fills up, future demand stays visible, so the next guest spot decision is grounded in actual interest.",
  },
];

const FLOW_FEATURES: FeatureBenefitItem[] = [
  {
    title: "City-based requests",
    description:
      "Collect where the client wants to get tattooed so demand does not stay buried in unrelated chats.",
  },
  {
    title: "Travel dates and booking windows",
    description:
      "Keep requests connected to the dates when you are actually in town.",
  },
  {
    title: "Tattoo-specific intake",
    description:
      "Collect idea, placement, size, references, and contact before deciding if the piece fits the trip.",
  },
  {
    title: "Guest spot waitlist",
    description:
      "Keep future demand visible when a city fills up or when you are planning where to travel next.",
  },
  {
    title: "Instagram booking link",
    description:
      "Announce the guest spot on Instagram, then send serious requests into a structured booking flow.",
  },
  {
    title: "Artist approval first",
    description:
      "Do not let a client pick a slot before you know if the tattoo makes sense for the trip.",
  },
];

const WORKFLOW_STEPS: FeatureBenefitItem[] = [
  {
    title: "Announce the city",
    description:
      "Post your guest spot dates, studio, or city on Instagram, then point people to your booking link.",
  },
  {
    title: "Client sends the request",
    description:
      "They submit the tattoo idea, references, placement, size, city, timing, and contact details.",
  },
  {
    title: "You review what fits",
    description:
      "Sort serious requests from maybes before locking in your limited travel time.",
  },
  {
    title: "Keep future demand visible",
    description:
      "If the trip fills up, city-based requests can still help you plan the next guest spot.",
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: "City demand",
    alternative: "Mixed into one inbox",
    inklee: "Collected with city and location context",
  },
  {
    feature: "Travel dates",
    alternative: "Often mentioned once, then buried",
    inklee: "Connected to the booking request",
  },
  {
    feature: "Tattoo details",
    alternative: "Spread across multiple messages",
    inklee: "Collected in one tattoo request form",
  },
  {
    feature: "Booking window",
    alternative: "Hard to track who fits the trip",
    inklee: "Easier to review before confirming",
  },
  {
    feature: "Waitlist",
    alternative: "Demand disappears after books close",
    inklee: "Future demand stays easier to read",
  },
  {
    feature: "Artist control",
    alternative: "Conversation can turn into accidental commitments",
    inklee: "Artist reviews before anything becomes a booking",
  },
];

const GUEST_SPOT_FAQ: FaqItem[] = [
  {
    question: "What is tattoo guest spot booking?",
    answer:
      "Tattoo guest spot booking is the process of collecting and organizing tattoo requests for a specific city, studio, or travel window. It usually involves more context than a normal booking because the artist has limited dates and needs to know if the piece fits the trip.",
  },
  {
    question: "Why are guest spot bookings harder to manage in DMs?",
    answer:
      "Guest spot requests often come from different cities, different time zones, and different levels of seriousness. In DMs, the city, dates, references, placement, and contact details can get split across multiple messages or disappear under newer chats.",
  },
  {
    question: "Can I use one booking link for multiple cities?",
    answer:
      "Yes. A structured booking link can help collect city and location context so you can separate regular requests from guest spot demand. That makes it easier to understand where people actually want to get tattooed.",
  },
  {
    question: "Should clients pick a slot immediately for a guest spot?",
    answer:
      "Usually not. For tattoo guest spots, the artist often needs to review the idea, size, placement, and available time first. A request-first flow helps prevent weak fits from turning into confirmed appointments too early.",
  },
  {
    question: "Can a guest spot booking link help with waitlists?",
    answer:
      "Yes. When a city fills up or your books are closed, a waitlist can keep future demand visible. That can help you decide whether it is worth returning to the same city later.",
  },
  {
    question: "Is this only for artists who travel internationally?",
    answer:
      "No. Guest spot booking can be useful for artists traveling between nearby cities, studios, conventions, or short-term work periods. The main point is organizing requests around location and limited dates.",
  },
  {
    question: "How does Instagram fit into guest spot booking?",
    answer:
      "Instagram can still be where you announce the trip and attract clients. The booking link handles the serious request so tattoo details, city, timing, and references do not stay scattered across DMs.",
  },
  {
    question: "Is Inklee a studio management system?",
    answer:
      "No. Inklee is focused on tattoo intake and booking requests for solo and traveling artists. It is not trying to replace heavy studio management, payroll, accounting, or every admin tool.",
  },
];

const RELATED_LINKS: RelatedLink[] = [
  {
    title: "Tattoo booking tool for artists",
    href: "/tattoo-booking-software",
    description:
      "See why tattoo bookings need more than a generic appointment scheduler.",
  },
  {
    title: "Instagram booking link for tattoo artists",
    href: "/instagram-booking-link-for-tattoo-artists",
    description:
      "Move serious booking requests from Instagram into a cleaner tattoo request flow.",
  },
  {
    title: "Guest spots feature page",
    href: "/guest-spots",
    description:
      "See the existing guest spots page and how Inklee frames travel-based booking.",
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

export default function GuestSpotBookingPage() {
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
      <JsonLd data={faqPageSchema(GUEST_SPOT_FAQ)} id="ld-faq" />
      <LandingHeader />
      <main className="flex-1">
        <MarketingHero
          eyebrow="Guest spot booking for tattoo artists"
          heading="Guest spot bookings without the DM mess"
          subhead="Collect city-based tattoo requests, travel dates, references, and client details before your guest spot turns into a pile of half-finished chats."
          primaryCta={{
            label: "Create your guest spot link",
            href: "/signup",
          }}
          secondaryCta={{
            label: "See the guest spots page",
            href: "/guest-spots",
            variant: "secondary",
          }}
          proof="Built for traveling artists, limited booking windows, and Instagram-first guest spot announcements."
          visual={
            <PlaceholderVisual
              label="Product preview placeholder"
              caption="City announcement → guest spot request → artist review"
              aspectRatio="wide"
            />
          }
        />
        <div className="h-[15px] bg-brand-rosa" />
        <DefinitionBlock
          eyebrow="Guest spot booking, built around travel"
          heading="Guest spot requests need more than a date and a studio name."
          body={[
            "A guest spot booking is not just a normal appointment in another city. The artist needs to know where the client is, which travel dates apply, what the tattoo idea is, whether the piece fits the available time, and how much real demand exists for that city.",
            "Inklee gives traveling artists a cleaner booking flow for guest spots. Instead of sorting requests through Instagram chats, artists can collect city, timing, tattoo details, references, and contact info in one structured request.",
          ]}
        />
        <ProblemSolutionBlock
          problemHeading="Traveling artists get booking chaos from every direction."
          problemBody="Guest spots usually start on Instagram, but the request details quickly split across stories, comments, DMs, screenshots, and old conversations. That makes it hard to know who wants what, in which city, and during which booking window."
          problemPoints={PROBLEM_POINTS}
          solutionHeading="Inklee gives each guest spot request a proper place to land."
          solutionBody="With Inklee, traveling artists can send people to one booking link and collect the details that matter before deciding what gets booked, waitlisted, or saved for a future trip."
          solutionPoints={SOLUTION_POINTS}
        />
        <FeatureBenefitGrid
          heading="What a guest spot booking flow should handle"
          intro="Guest spot booking is half tattoo intake, half travel planning. The flow has to support both, otherwise the artist ends up doing admin in the middle of a trip."
          items={FLOW_FEATURES}
          columns={3}
        />
        <FeatureBenefitGrid
          heading="How guest spot booking works with Inklee"
          intro="The announcement can still happen on Instagram. Inklee just gives the booking part a better structure."
          items={WORKFLOW_STEPS}
          columns={2}
        />
        <ComparisonTable
          heading="Instagram DMs vs a guest spot booking flow"
          intro="Instagram is great for announcing a guest spot. It is not great for managing all the details that come after."
          alternativeLabel="Instagram DMs"
          inkleeLabel="Inklee"
          rows={COMPARISON_ROWS}
          note="Inklee does not replace the way tattoo artists announce travel. It gives the serious guest spot requests a cleaner place to land."
        />
        <div className="h-[15px] bg-brand-red" />
        <FaqSection
          eyebrow="FAQ"
          heading="Guest spot booking, answered"
          items={GUEST_SPOT_FAQ}
        />
        <RelatedLinksBlock
          heading="More ways to organize tattoo requests"
          intro="Keep the travel booking flow connected with three more reads on how Inklee fits the way tattoo artists actually work."
          links={RELATED_LINKS}
          columns={3}
        />
        <FinalCta
          heading="Plan guest spots without turning DMs into admin work."
          subhead="Give clients one place to send city, timing, tattoo details, references, and contact info."
          primaryCta={{
            label: "Create your guest spot link",
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
