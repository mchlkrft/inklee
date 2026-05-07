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

const PAGE_PATH = "/tattoo-booking-form";
const PAGE_TITLE = "Tattoo Booking Form for Artists · Inklee";
const PAGE_DESCRIPTION =
  "Create a tattoo booking form that collects ideas, placement, size, references, timing, and contact details before DMs get messy.";
const OG_TITLE = "A tattoo booking form built around real requests";
const OG_DESCRIPTION =
  "Inklee helps tattoo artists collect the details they need before deciding which tattoo requests become bookings.";

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
    title: "“How much?” without placement or size",
    description:
      "The price question lands first, before any of the context that actually changes the price. You ask. They answer. The momentum dies.",
  },
  {
    title: "Reference images separated from the actual request",
    description:
      "Saved screenshots in one thread, a description in another, a question in a third. You spend more time piecing the request together than answering it.",
  },
  {
    title: "Preferred dates mentioned once and then buried",
    description:
      "A date drops mid-conversation, then disappears under three new messages. By the time you scroll back, the timing makes no sense.",
  },
  {
    title: "Guest spot city missing from the message",
    description:
      "A traveling-client request without a city forces the artist to ask, then wait, then ask again — usually after the trip is already locked in.",
  },
  {
    title: "Artists repeating the same intake questions again and again",
    description:
      "Placement. Size. References. Timing. Same questions, copy-pasted into a different DM, every single week.",
  },
];

const SOLUTION_POINTS: SolutionPoint[] = [
  {
    title: "Collect tattoo-specific details in one place",
    description:
      "Instead of asking five questions across five replies, the form gathers the basics before the conversation even starts.",
  },
  {
    title: "Keep reference images connected to the request",
    description:
      "Visuals stay attached to the idea they belong to, not floating in a separate chat thread above or below the message.",
  },
  {
    title: "Ask for placement, size, timing, and contact details upfront",
    description:
      "By the time you read the request, the four things that decide whether it can become a booking are already on the page.",
  },
  {
    title: "Review the request before confirming anything",
    description:
      "The form is the first step, not the last. You decide whether the idea fits before any time slot is offered.",
  },
  {
    title:
      "Use the same flow from Instagram bio, replies, or guest spot announcements",
    description:
      "One link, one form. It works the same whether the client found you through bio, stories, a DM reply, or a city announcement.",
  },
];

const FORM_FIELDS: FeatureBenefitItem[] = [
  {
    title: "Tattoo idea",
    description:
      "Let clients describe the concept in their own words before the conversation turns into guessing.",
  },
  {
    title: "Placement",
    description:
      "Body placement changes the design, time, price, and whether the idea works at all.",
  },
  {
    title: "Size",
    description:
      "A rough size helps the artist understand scope before talking dates or cost.",
  },
  {
    title: "Reference images",
    description:
      "Keep inspiration, style direction, and visual notes connected to the request.",
  },
  {
    title: "Preferred timing",
    description:
      "Collect date preferences without letting clients instantly lock a slot too early.",
  },
  {
    title: "Contact details",
    description:
      "Keep email, Instagram handle, or other contact info attached to the booking request.",
  },
  {
    title: "City or guest spot location",
    description:
      "Useful for traveling artists who need to separate local requests from trip-specific demand.",
  },
  {
    title: "Optional notes",
    description:
      "Give clients space for scars, cover-ups, budget context, or anything else the artist should know.",
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: "Request context",
    alternative: "Short message field",
    inklee: "Idea, placement, size, references, timing, and contact",
  },
  {
    feature: "Reference images",
    alternative: "Often missing or sent separately",
    inklee: "Attached to the request context",
  },
  {
    feature: "Artist approval",
    alternative: "Usually just sends a message",
    inklee: "Supports review before confirmation",
  },
  {
    feature: "Instagram workflow",
    alternative: "Often disconnected from bio and DMs",
    inklee: "Works as the next step from Instagram inquiries",
  },
  {
    feature: "Guest spots",
    alternative: "Usually no city or travel context",
    inklee: "Can support location and guest spot demand",
  },
  {
    feature: "Booking clarity",
    alternative: "Creates more follow-up questions",
    inklee: "Reduces repeated intake questions",
  },
];

const WORKFLOW_STEPS: FeatureBenefitItem[] = [
  {
    title: "Client sends the request",
    description:
      "They submit the idea, placement, size, references, timing, and contact details.",
  },
  {
    title: "Artist reviews the fit",
    description:
      "You decide whether the piece fits your style, schedule, travel plans, or booking window.",
  },
  {
    title: "Next step becomes clearer",
    description:
      "Approve, reject, waitlist, or follow up with better context instead of starting from zero.",
  },
  {
    title: "The request stays organized",
    description:
      "Details stay attached to the booking request instead of disappearing across messages.",
  },
];

const FORM_FAQ: FaqItem[] = [
  {
    question: "What should a tattoo booking form ask for?",
    answer:
      "A tattoo booking form should ask for the tattoo idea, placement, size, reference images, preferred timing, contact details, and any notes the artist needs before reviewing the request. The goal is to collect enough context before the artist replies.",
  },
  {
    question: "Is a tattoo booking form different from a contact form?",
    answer:
      "Yes. A contact form usually collects a name, email, and message. A tattoo booking form should collect tattoo-specific details like placement, size, references, style direction, city, and timing.",
  },
  {
    question: "Should a booking form let clients pick a time immediately?",
    answer:
      "Not always. Many tattoo artists need to review the idea before confirming a booking. A request-first form is usually better because it lets the artist decide what fits before a client locks a slot.",
  },
  {
    question: "Can I use a tattoo booking form with Instagram?",
    answer:
      "Yes. Many artists use a booking form as the next step after Instagram. The client finds the artist on Instagram, taps the booking link, and submits the tattoo request with the details in one place.",
  },
  {
    question: "Should I ask for reference images?",
    answer:
      "Yes. Reference images help the artist understand style, direction, and expectations. They should stay attached to the request so the artist does not have to search through old messages.",
  },
  {
    question: "Should I ask for budget in a tattoo form?",
    answer:
      "It depends on the artist. Some artists want budget context early, while others prefer to quote based on idea, placement, size, and time. The form should be flexible enough to match the artist's workflow.",
  },
  {
    question: "Can a tattoo booking form help with guest spots?",
    answer:
      "Yes. For guest spots, a form can collect city, travel timing, placement, size, references, and contact details. That makes it easier to separate trip-based demand from regular requests.",
  },
  {
    question: "Does a booking form make the process feel too formal?",
    answer:
      "Not if it is written in the artist's voice. A good tattoo booking form should feel like a clean request flow, not a corporate appointment portal.",
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
    title: "Booking requests without DM chaos",
    href: "/dm-chaos",
    description:
      "See how Inklee keeps serious requests from disappearing in Instagram chats.",
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

export default function TattooBookingFormPage() {
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
      <JsonLd data={faqPageSchema(FORM_FAQ)} id="ld-faq" />
      <LandingHeader />
      <main className="flex-1">
        <MarketingHero
          eyebrow="Tattoo booking form for artists"
          heading="A tattoo booking form for real tattoo requests"
          subhead="Collect the idea, placement, size, references, timing, and contact details before you spend another afternoon asking the same questions in DMs."
          primaryCta={{
            label: "Build your tattoo request form",
            href: "/signup",
          }}
          secondaryCta={{
            label: "See the booking tool page",
            href: "/tattoo-booking-software",
            variant: "secondary",
          }}
          proof="Built for solo artists, Instagram requests, guest spots, and approval-first booking flows."
          visual={
            <PlaceholderVisual
              label="Product preview placeholder"
              caption="Client idea → tattoo request form → artist review"
              aspectRatio="wide"
            />
          }
        />
        <div className="h-[15px] bg-brand-rosa" />
        <DefinitionBlock
          eyebrow="Tattoo intake, not a generic contact form"
          heading="A good tattoo form helps you decide before you reply."
          body={[
            "A tattoo booking form is not just a name, email, and message box. It should collect the details that actually change the work: the idea, body placement, size, references, timing, and how the client can be reached.",
            "Inklee turns that first messy request into a cleaner tattoo intake flow. Clients send the context first, and the artist can review whether the piece fits their style, schedule, city, or booking window before confirming anything.",
          ]}
        />
        <ProblemSolutionBlock
          problemHeading="Most tattoo requests arrive half-finished."
          problemBody="A client might send a screenshot, ask for a price, forget the placement, skip the size, and then disappear before the artist has enough information to answer properly."
          problemPoints={PROBLEM_POINTS}
          solutionHeading="A better form gets the important details first."
          solutionBody="With Inklee, the client sends a structured tattoo request before the artist decides what happens next. That makes the first reply faster, clearer, and less dependent on digging through chat history."
          solutionPoints={SOLUTION_POINTS}
        />
        <FeatureBenefitGrid
          heading="Fields a tattoo booking form should include"
          intro="The exact form can change from artist to artist, but these fields are the difference between a useful request and another vague message."
          items={FORM_FIELDS}
          columns={3}
        />
        <ComparisonTable
          heading="Generic contact form vs tattoo booking form"
          intro="A basic form can collect a message. A tattoo request form should collect enough context for the artist to make a decision."
          alternativeLabel="Generic contact form"
          inkleeLabel="Inklee tattoo form"
          rows={COMPARISON_ROWS}
          note="The goal is not to make clients fill out a tax return. The goal is to collect enough detail so the artist can answer properly."
        />
        <FeatureBenefitGrid
          heading="How the tattoo request flow works"
          intro="The form is just the first step. The important part is what it makes possible after the request arrives."
          items={WORKFLOW_STEPS}
          columns={2}
        />
        <div className="h-[15px] bg-brand-red" />
        <FaqSection
          eyebrow="FAQ"
          heading="Tattoo booking forms, answered"
          items={FORM_FAQ}
        />
        <RelatedLinksBlock
          heading="More ways to organize tattoo bookings"
          intro="Keep the request flow connected with three more reads on how Inklee fits the way tattoo artists actually work."
          links={RELATED_LINKS}
          columns={3}
        />
        <FinalCta
          heading="Stop starting every tattoo request from zero."
          subhead="Give clients one place to send the tattoo details you actually need."
          primaryCta={{
            label: "Build your tattoo request form",
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
