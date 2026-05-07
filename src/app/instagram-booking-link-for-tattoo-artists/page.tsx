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

const PAGE_PATH = "/instagram-booking-link-for-tattoo-artists";
const PAGE_TITLE = "Instagram Booking Link for Tattoo Artists · Inklee";
const PAGE_DESCRIPTION =
  "Create an Instagram booking link for tattoo requests. Collect ideas, placement, size, references, and timing before DMs get messy.";
const OG_TITLE = "One booking link for tattoo requests from Instagram";
const OG_DESCRIPTION =
  "Inklee helps tattoo artists turn Instagram chats, bio clicks, and story replies into structured tattoo booking requests.";

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
    title: "Clients send references without placement or size",
    description:
      "An image lands in your inbox without context. You ask for placement. They reply tomorrow. Nothing moves until the basics arrive.",
  },
  {
    title: "Serious requests get mixed with reactions and casual chat",
    description:
      "Real booking inquiries sit in the same thread as story reactions, voice notes, and people just saying hi.",
  },
  {
    title: "Artists repeat the same intake questions every week",
    description:
      "Placement. Size. References. Timing. Same questions, copy-pasted into different DMs, every single time.",
  },
  {
    title: "Guest spot requests get buried under regular messages",
    description:
      "City-specific demand for next month's trip ends up in the same inbox as ongoing local clients and old DMs.",
  },
  {
    title: "Good clients disappear because the next step is unclear",
    description:
      "If the path from “I'm interested” to “send your request” is fuzzy, motivated clients lose momentum before anything is booked.",
  },
];

const SOLUTION_POINTS: SolutionPoint[] = [
  {
    title: "Add one booking link to your Instagram bio",
    description:
      "A single Inklee link sits where clients already look. No more “DM me to book” without a clear next step.",
  },
  {
    title: "Send the link in replies when someone asks to book",
    description:
      "Instead of typing the same intake questions, you reply with the booking link and let the form do the work.",
  },
  {
    title: "Collect tattoo-specific details before answering",
    description:
      "Idea, placement, size, references, and timing land together so you can review the request properly.",
  },
  {
    title: "Review the request before confirming anything",
    description:
      "Decide whether the idea fits your work, your schedule, and your style before any time is offered.",
  },
  {
    title: "Keep travel and guest spot requests easier to separate",
    description:
      "Location and trip context comes in with the request, so traveling artists can sort city demand without untangling threads.",
  },
];

const LINK_FIELDS: FeatureBenefitItem[] = [
  {
    title: "Tattoo idea",
    description:
      "Let clients explain what they want before the conversation turns into price guessing.",
  },
  {
    title: "Placement and size",
    description:
      "Get the body area and rough size early, because both change the work, timing, and quote.",
  },
  {
    title: "Reference images",
    description:
      "Keep visual references attached to the request instead of buried above or below the actual message.",
  },
  {
    title: "Preferred timing",
    description:
      "Collect date preferences without letting clients instantly book a slot too early.",
  },
  {
    title: "Contact details",
    description:
      "Keep Instagram handle, email, or other contact info connected to the request.",
  },
  {
    title: "Guest spot location",
    description:
      "For traveling artists, city and location context helps separate local requests from trip-specific demand.",
  },
];

const WORKFLOW_STEPS: FeatureBenefitItem[] = [
  {
    title: "Put the link where clients already look",
    description:
      "Add the Inklee link to your bio, stories, highlights, or booking replies.",
  },
  {
    title: "Client submits the tattoo request",
    description:
      "They send the idea, placement, size, references, timing, and contact details.",
  },
  {
    title: "You review before saying yes",
    description:
      "You decide whether the idea fits your work, schedule, city, or guest spot.",
  },
  {
    title: "Next steps stay cleaner",
    description:
      "Approval, waitlist, or follow-up can happen with better context.",
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: "First contact",
    alternative: "Easy and familiar",
    inklee:
      "Still starts from Instagram, but gives serious requests a structure",
  },
  {
    feature: "Request details",
    alternative: "Spread across multiple messages",
    inklee: "Collected in one tattoo request form",
  },
  {
    feature: "References",
    alternative: "Easy to lose in the scroll",
    inklee: "Attached to the request context",
  },
  {
    feature: "Artist decision",
    alternative: "Hard to track what has been answered",
    inklee: "Easier to review before approving",
  },
  {
    feature: "Guest spots",
    alternative: "City requests mix with everything else",
    inklee: "Easier to separate location-based demand",
  },
];

const INSTAGRAM_FAQ: FaqItem[] = [
  {
    question: "What is an Instagram booking link for tattoo artists?",
    answer:
      "It is a link artists can place in their Instagram bio, stories, highlights, or replies so clients can submit tattoo booking requests in a structured way. Instead of keeping every detail inside DMs, the client fills out the information the artist needs to review the idea.",
  },
  {
    question: "Do I still need Instagram DMs if I use a booking link?",
    answer:
      "Yes. DMs can still be useful for conversation, trust, and quick replies. The booking link is for the serious request, where the idea, placement, size, references, and timing need to stay organized.",
  },
  {
    question: "What should I write in my Instagram bio?",
    answer:
      "Keep it simple and direct. For example: “Booking requests through the link below” or “For tattoos and guest spots, send your request here.” The goal is to make the next step obvious without sounding stiff.",
  },
  {
    question: "Can I send the booking link inside a DM?",
    answer:
      "Yes. That is often the cleanest workflow. When someone asks to book, you can reply with the link instead of asking every intake question manually.",
  },
  {
    question: "Is a booking link better than asking clients to message me?",
    answer:
      "For casual questions, messages are fine. For serious tattoo requests, a booking link is usually cleaner because it collects the details in one place before you spend time going back and forth.",
  },
  {
    question: "Can traveling artists use one Instagram booking link?",
    answer:
      "Yes. A single booking link can help traveling artists collect requests connected to cities, guest spots, and future demand. That makes it easier to see where people actually want to get tattooed.",
  },
  {
    question: "Can I use Inklee if my books are closed?",
    answer:
      "Yes. A booking link can still be useful when books are closed because it can direct people toward a waitlist or future request flow instead of leaving demand scattered in DMs.",
  },
  {
    question: "Does the booking link make me look too formal?",
    answer:
      "Not if the flow is written in your voice. Inklee is built to feel like a clean tattoo request process, not a corporate appointment portal.",
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
    title: "Booking requests without DM chaos",
    href: "/dm-chaos",
    description:
      "See how Inklee keeps serious requests from disappearing in Instagram chats.",
  },
  {
    title: "Guest spot booking for traveling artists",
    href: "/guest-spot-booking",
    description:
      "Collect city-based tattoo requests when announcing travel or guest spots.",
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

export default function InstagramBookingLinkPage() {
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
      <JsonLd data={faqPageSchema(INSTAGRAM_FAQ)} id="ld-faq" />
      <LandingHeader />
      <main className="flex-1">
        <MarketingHero
          eyebrow="Instagram booking link for tattoo artists"
          heading="One booking link for tattoo requests"
          subhead="Use Inklee in your Instagram bio, stories, or replies so serious clients send the idea, placement, size, references, and timing before the chat gets messy."
          primaryCta={{
            label: "Create your booking link",
            href: "/signup",
          }}
          secondaryCta={{
            label: "See the DM chaos page",
            href: "/dm-chaos",
            variant: "secondary",
          }}
          proof="Built for solo artists, guest spots, and Instagram-first tattoo booking flows."
          visual={
            <PlaceholderVisual
              label="Product preview placeholder"
              caption="Instagram bio link → tattoo request form → artist review"
              aspectRatio="wide"
            />
          }
        />
        <div className="h-[15px] bg-brand-rosa" />
        <DefinitionBlock
          eyebrow="From link in bio to real tattoo request"
          heading="Your Instagram should start the booking. It should not manage the whole thing."
          body={[
            "Instagram is where many clients find tattoo artists, ask questions, and react to new work. That part is useful. The problem starts when every serious request stays inside a chat thread with missing details, buried references, and no clear next step.",
            "Inklee gives artists one booking link they can use in their bio, stories, posts, or replies. Instead of asking the same questions again and again, clients submit a structured tattoo request before the artist decides what should get booked.",
          ]}
        />
        <ProblemSolutionBlock
          problemHeading="DMs are good for talking. Bad for booking structure."
          problemBody="A tattoo request needs more than “how much?” or “are you free next week?” But Instagram chats make it easy for important details to arrive out of order, disappear in the scroll, or never arrive at all."
          problemPoints={PROBLEM_POINTS}
          solutionHeading="A booking link gives the request a place to land."
          solutionBody="With Inklee, Instagram can stay the place where interest starts. The booking link moves serious requests into a cleaner flow, so the artist can review the idea with the right details in one place."
          solutionPoints={SOLUTION_POINTS}
        />
        <FeatureBenefitGrid
          heading="What your Instagram booking link should collect"
          intro="A good tattoo booking link is not just a contact form. It should collect enough context so you can decide if the request is worth booking."
          items={LINK_FIELDS}
          columns={3}
        />
        <FeatureBenefitGrid
          heading="How the Instagram booking flow works"
          intro="The client still finds you on Instagram. The difference is what happens after they are serious enough to ask about booking."
          items={WORKFLOW_STEPS}
          columns={2}
        />
        <ComparisonTable
          heading="Instagram DM booking vs a booking link"
          intro="Instagram DMs are useful for conversation. They are just not built to act like a booking system."
          alternativeLabel="Instagram DMs"
          inkleeLabel="Inklee booking link"
          rows={COMPARISON_ROWS}
          note="Inklee does not replace Instagram. It just stops Instagram from being the place where every booking detail has to survive."
        />
        <div className="h-[15px] bg-brand-red" />
        <FaqSection
          eyebrow="FAQ"
          heading="Instagram booking links, answered"
          items={INSTAGRAM_FAQ}
        />
        <RelatedLinksBlock
          heading="Go deeper into better tattoo requests"
          intro="Keep the booking flow connected with three more reads on how Inklee fits the way tattoo artists actually work."
          links={RELATED_LINKS}
          columns={3}
        />
        <FinalCta
          heading="Turn your Instagram bio into a cleaner booking flow."
          subhead="Give clients one place to send the tattoo details you actually need."
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
