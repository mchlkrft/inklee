import type { Metadata } from "next";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import {
  PillNav,
  SiteFooter,
  ComparePageContent,
} from "@/components/marketing-v2";

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
  alternates: { canonical: PAGE_PATH },
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

const FAQ = [
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

export default function ComparePage() {
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
      <JsonLd data={faqPageSchema(FAQ)} id="ld-faq" />
      <PillNav />
      <main className="flex-1">
        <ComparePageContent
          alternativeName="Google Forms"
          alternativeLabel="Google Forms"
          inkleeLabel="Inklee"
          eyebrow="Inklee vs Google Forms"
          heroHeadBlack="A form builder"
          heroHeadMustard="vs a tattoo booking tool."
          subline="Google Forms collects answers. Inklee turns answers into a tattoo booking workflow with approvals, deposits, waitlists, and guest spot structure."
          heroIllustration="/branding/illustrations/mixed/inklee-_Google-Form-vs-Inklee.svg"
          definitionHeading={[
            "A form collects answers.",
            "A booking flow handles work.",
          ]}
          definitionBody={[
            "Google Forms can ask whatever tattoo intake questions you want. The answers land in a spreadsheet, and the rest of the booking work happens by hand.",
            "Inklee starts from the same idea (a structured form) but keeps approval, deposit status, waitlist, and guest spot context attached to the request instead of inside a separate sheet.",
          ]}
          definitionIllustration="/branding/illustrations/mixed/inklee-_inklee-form-yellow.svg"
          problemHeading={["A generic form", "is not a booking tool."]}
          problemBody="The five gaps that show up once tattoo intake gets serious."
          problemPoints={[
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
          ]}
          solutionHeading={["Inklee turns intake", "into a booking flow."]}
          solutionBody="The same structured form, plus the artist tools that should come after it."
          solutionPoints={[
            {
              title: "Structured tattoo requests",
              description:
                "Clients submit idea, placement, size, description, references, images, timing, and contact in one go.",
            },
            {
              title: "Artist review before approval",
              description:
                "Requests do not become bookings automatically. The artist decides what moves forward.",
            },
            {
              title: "Booking states that make sense",
              description:
                "Pending, approved, rejected, deposit pending, waitlist, cancelled. Not just rows in a sheet.",
            },
            {
              title: "Deposit-aware workflow",
              description:
                "Deposits are part of the booking flow. Availability depends on your setup and enabled features.",
            },
            {
              title: "Guest spot structure",
              description:
                "City, dates, and booking windows are first-class, not another sheet column.",
            },
          ]}
          comparisonRows={[
            {
              feature: "Tattoo request intake",
              alt: "Custom questions collect answers",
              inklee: "Built around tattoo idea, placement, size, references",
            },
            {
              feature: "Artist approval",
              alt: "No native booking approval flow",
              inklee: "Artists review before approving or rejecting",
            },
            {
              feature: "Booking status",
              alt: "Managed manually in Sheets",
              inklee: "Requests move through booking-specific states",
            },
            {
              feature: "References and uploads",
              alt: "Files or links attached, review is manual",
              inklee: "References stay connected to the request",
            },
            {
              feature: "Deposits",
              alt: "External setup and manual tracking",
              inklee: "Part of the booking flow",
            },
            {
              feature: "Guest spots",
              alt: "Requires separate forms, sheets, or sorting",
              inklee: "City and date-based workflows",
            },
            {
              feature: "Client experience",
              alt: "Functional but generic and lightly branded",
              inklee: "Public booking page for tattoo request intake",
            },
          ]}
          usefulHeading={["Google Forms still works", "in the right places."]}
          usefulBody="A free form builder is fine when the request volume is low and the workflow is simple."
          usefulCards={[
            {
              title: "Very low request volume",
              description:
                "If you only get a few requests per month, a simple form may be enough for basic intake.",
              variant: "mustard",
            },
            {
              title: "Temporary testing",
              description:
                "Google Forms can work when you only want to test which questions clients should answer before building a proper booking flow.",
              variant: "bone",
            },
            {
              title: "Simple contact collection",
              description:
                "If you only need names, emails, and one message field, Google Forms can do the job.",
              variant: "rosa",
            },
            {
              title: "Non-booking surveys",
              description:
                "For feedback, polls, or general research, Google Forms is still a practical tool.",
              variant: "bone",
            },
          ]}
          wrongJobHeading={["When Google Forms", "starts fighting the work."]}
          wrongJobBody="If your booking life happens inside the response spreadsheet, the form is no longer enough."
          wrongJobCards={[
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
          ]}
          faq={FAQ}
          related={[
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
          ]}
          finalCtaHead={[
            "Stop running tattoo bookings",
            "through a spreadsheet.",
          ]}
          finalCtaBody="Inklee gives the same structured request, plus the approval, deposit, and guest spot flow Google Forms cannot."
        />
      </main>
      <SiteFooter />
    </div>
  );
}
