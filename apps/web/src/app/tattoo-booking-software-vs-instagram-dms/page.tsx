import type { Metadata } from "next";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import {
  PillNav,
  SiteFooter,
  ComparePageContent,
} from "@/components/marketing-v2";

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
          alternativeName="Instagram DMs"
          alternativeLabel="Instagram DMs"
          inkleeLabel="Inklee"
          eyebrow="Inklee vs Instagram DMs"
          heroHeadBlack="Instagram DMs"
          heroHeadMustard="vs a tattoo booking tool."
          subline="Use Instagram for attention. Use Inklee for the booking. The two work together, but only one is built for tattoo intake."
          heroIllustration="/branding/illustrations/mixed/inklee-_chat-vs-inklee-request-form.svg"
          heroSize="large"
          definitionHeading={[
            "DMs are for talking.",
            "Bookings need structure.",
          ]}
          definitionBody={[
            "Instagram DMs are great when the goal is conversation. They are not built for tattoo intake, approval, references, deposits, or guest spot demand.",
            "A booking link does not replace the chat. It gives serious tattoo requests a cleaner place to land while DMs stay where the casual conversation already happens.",
          ]}
          definitionIllustration="/branding/illustrations/mixed/inklee-_DM-to-Booking-Form.svg"
          problemHeading={["Six ways DMs", "lose the request."]}
          problemBody="DMs are good for trust and conversation. They are bad for keeping a tattoo request together."
          problemPoints={[
            {
              title: "Clients send “how much?” without enough context",
              description:
                "The price question lands first, before idea, placement, or size. You ask back. They answer tomorrow. Nothing moves.",
            },
            {
              title: "Reference images get separated from the actual idea",
              description:
                "A screenshot in one thread, a description in another, and a question in a third. Three pieces of the same request, scattered.",
            },
            {
              title: "Serious requests sit next to reactions and casual chats",
              description:
                "A real tattoo inquiry shares the inbox with story replies, voice notes, and people just saying hello.",
            },
            {
              title: "Guest spot requests mix with local requests",
              description:
                "Berlin, your home studio, and last year's trip all live in the same DM list, and sorting them turns into manual admin.",
            },
            {
              title: "Artists repeat the same intake questions every week",
              description:
                "Placement, size, references, timing, contact. Same questions, copy-pasted into a different DM, every single week.",
            },
            {
              title: "Good requests disappear because the next step is unclear",
              description:
                "When the path from interest to request is fuzzy, motivated clients lose momentum before anything is booked.",
            },
          ]}
          solutionHeading={[
            "Inklee gives serious requests",
            "a structured next step.",
          ]}
          solutionBody="DMs stay for trust and chat. Inklee handles the actual booking request."
          solutionPoints={[
            {
              title: "One link for bio, stories, and replies",
              description:
                "A single Inklee link covers every place clients already look. Serious requests land in structure, not in another DM thread.",
            },
            {
              title: "Tattoo request form for the basics",
              description:
                "Idea, placement, size, references, and timing land together before the conversation even starts.",
            },
            {
              title: "Artist review before booking",
              description:
                "Decide whether the idea fits before any time slot is offered. The form is the first step, not the last.",
            },
            {
              title: "Cleaner overview for guest spots",
              description:
                "Travel requests stay tagged to a city and trip window. Future demand stays visible after a city fills up.",
            },
            {
              title: "Less repeated admin",
              description:
                "Stop typing the same intake questions into different threads. The form does it once, every time.",
            },
          ]}
          comparisonRows={[
            {
              feature: "First contact",
              alt: "Fast, familiar, already where clients are",
              inklee:
                "Starts from Instagram, moves serious requests into structure",
            },
            {
              feature: "Request details",
              alt: "Spread across multiple messages",
              inklee: "Collected in one tattoo request form",
            },
            {
              feature: "Reference images",
              alt: "Easy to lose above or below the main message",
              inklee: "Attached to the request context",
            },
            {
              feature: "Artist approval",
              alt: "Hard to track what is ready, answered, or missing",
              inklee: "Artist reviews before confirming anything",
            },
            {
              feature: "Guest spots",
              alt: "City and travel requests mix with normal chats",
              inklee:
                "Easier to separate city demand and trip-specific requests",
            },
            {
              feature: "Waitlist",
              alt: "Future demand disappears after books close",
              inklee: "Requests and waitlist interest stay easier to read",
            },
            {
              feature: "Client next step",
              alt: "Often unclear unless the artist explains it",
              inklee: "One clear request link for serious inquiries",
            },
          ]}
          usefulHeading={["DMs still belong", "in the booking flow."]}
          usefulBody="The booking link does not replace Instagram. It just takes the parts DMs are bad at."
          usefulCards={[
            {
              title: "Use DMs for trust",
              description:
                "Quick questions, vibe checks, and casual replies can stay in Instagram.",
              variant: "mustard",
            },
            {
              title: "Use posts and stories for attention",
              description:
                "Instagram is still the place where clients discover your work and learn when books open.",
              variant: "bone",
            },
            {
              title: "Use the booking link for serious requests",
              description:
                "When someone wants to book, the link collects the details you need before you answer.",
              variant: "rosa",
            },
            {
              title: "Use Inklee for request structure",
              description:
                "The request stays organized enough to review, approve, waitlist, or follow up.",
              variant: "bone",
            },
          ]}
          wrongJobHeading={["When DMs alone", "stop working."]}
          wrongJobBody="If any of these sound familiar, you are running tattoo intake on the wrong tool."
          wrongJobCards={[
            {
              title: "You ask the same questions every week",
              description:
                "Placement, size, references, dates, and contact details should not be rebuilt from scratch every time.",
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
          ]}
          faq={FAQ}
          related={[
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
          ]}
          finalCtaHead={["Keep the chat.", "Move the booking."]}
          finalCtaBody="Inklee gives serious tattoo requests a structured next step, without taking the conversation out of Instagram."
        />
      </main>
      <SiteFooter />
    </div>
  );
}
