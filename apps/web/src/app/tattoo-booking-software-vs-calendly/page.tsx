import type { Metadata } from "next";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import {
  PillNav,
  SiteFooter,
  ComparePageContent,
} from "@/components/marketing-v2";

const PAGE_PATH = "/tattoo-booking-software-vs-calendly";
const PAGE_TITLE = "Tattoo Booking Software vs Calendly | Inklee";
const PAGE_DESCRIPTION =
  "A Calendly alternative for tattoo artists. Tattoo intake needs idea-first requests, artist review, deposits, waitlists, and guest spot flow.";
const OG_TITLE = "Tattoo Booking Software vs Calendly";
const OG_DESCRIPTION =
  "See when Calendly works for tattoo artists and when Inklee's tattoo-first request flow makes more sense.";

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
  {
    question: "Is Inklee a good Calendly alternative for tattoo artists?",
    answer:
      "Yes, for tattoo intake. Calendly is a scheduling alternative for fixed appointments like consultations and touch-ups, but Inklee is built for tattoo booking requests: the client submits the idea, placement, size, and references, and the artist reviews before a slot becomes a booking.",
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
          alternativeName="Calendly"
          alternativeLabel="Calendly"
          inkleeLabel="Inklee"
          eyebrow="Inklee vs Calendly"
          heroHeadBlack="A scheduler"
          heroHeadMustard="vs a tattoo booking tool."
          subline="Calendly is great when the task is to book a time slot. Tattoo bookings usually need idea review before any slot makes sense. Here is when each fits."
          heroIllustration="/branding/illustrations/mixed/inklee-_Artist-with-Flash-Background-2.svg"
          definitionHeading={["Tattoo bookings", "do not start with a slot."]}
          definitionBody={[
            "Calendly is built around picking an available time. For a tattoo, the artist usually needs to see the idea, placement, size, references, and timing first.",
            "When the idea has not been approved, a calendar slot is not really a booking yet. That is the gap a tattoo-first booking tool closes.",
          ]}
          definitionIllustration="/branding/illustrations/mixed/inklee-_client-idea-drawing.svg"
          problemHeading={["Slot-first booking", "skips the tattoo review."]}
          problemBody="The five things Calendly does not solve for tattoo intake."
          problemPoints={[
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
          ]}
          solutionHeading={["Inklee starts", "with the idea."]}
          solutionBody="Tattoo-first booking flow: collect the request, review it, approve it, then schedule."
          solutionPoints={[
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
                "Deposits are built into the booking flow. Availability depends on your current setup and enabled features.",
            },
            {
              title: "Guest spot support",
              description:
                "Traveling artists can organize requests around cities, travel dates, and booking windows.",
            },
          ]}
          comparisonRows={[
            {
              feature: "Main logic",
              alt: "Time slot first",
              inklee: "Tattoo idea first",
            },
            {
              feature: "Best use case",
              alt: "Meetings, calls, fixed services, consultations",
              inklee: "Tattoo requests, artist review, approvals, guest spots",
            },
            {
              feature: "Client starting point",
              alt: "Pick an available time",
              inklee: "Submit idea, placement, size, references, and timing",
            },
            {
              feature: "Artist control",
              alt: "Booking can happen before full project review",
              inklee: "Artist reviews before approving",
            },
            {
              feature: "Tattoo context",
              alt: "Handled through notes or separate forms",
              inklee: "Built into the booking request flow",
            },
            {
              feature: "Deposits",
              alt: "External setup or payment configuration",
              inklee: "Part of the booking flow after approval",
            },
            {
              feature: "Guest spots",
              alt: "Generic scheduling link needs manual workarounds",
              inklee: "City and date-based workflows",
            },
          ]}
          usefulHeading={["Calendly is still useful", "in the right places."]}
          usefulBody="Not every tattoo booking step needs a tattoo-specific tool. Calendly works for these."
          usefulCards={[
            {
              title: "Consultation calls",
              description:
                "Calendly works when the goal is to book a call or studio consultation.",
              variant: "mustard",
            },
            {
              title: "Touch-up appointments",
              description:
                "When the tattoo is already approved and the task is clear, scheduling a time slot can be enough.",
              variant: "bone",
            },
            {
              title: "Aftercare check-ins",
              description:
                "Quick follow-up calls fit a meeting-style scheduler better than full tattoo intake.",
              variant: "rosa",
            },
            {
              title: "Studio-side scheduling",
              description:
                "For staff calendars and manager-controlled appointments, Calendly can still make sense.",
              variant: "bone",
            },
          ]}
          wrongJobHeading={["When Calendly", "is the wrong job."]}
          wrongJobBody="If any of these sound familiar, the booking process is fighting the tool."
          wrongJobCards={[
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
          ]}
          faq={FAQ}
          related={[
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
          ]}
          finalCtaHead={["Stop treating tattoo intake", "like a meeting."]}
          finalCtaBody="Inklee gives tattoo artists an idea-first booking flow with the approval, deposit, and guest spot structure custom work actually needs."
        />
      </main>
      <SiteFooter />
    </div>
  );
}
