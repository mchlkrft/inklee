import type { Metadata } from "next";
import Link from "next/link";
import TrackedCtaLink from "@/components/tracked-cta-link";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

const PAGE_PATH = "/tattoo-client-management";
const PAGE_TITLE = "Tattoo client management software · Inklee";
const PAGE_DESCRIPTION =
  "Tattoo client management software for artists. Client records build themselves from booking requests: contact info, tattoo history, and private notes.";
const OG_TITLE = "Tattoo client management software";
const OG_DESCRIPTION =
  "Client information, booking history, and private notes that build themselves from tattoo requests. No spreadsheets, no manual data entry.";

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

type Item = { title: string; description: string };
type Faq = { question: string; answer: string };
type Related = { title: string; description: string; href: string };

const PROBLEM_POINTS: Item[] = [
  {
    title: "Client information lives in five places",
    description:
      "Names in DMs, dates in a calendar, references in camera rolls, deposit notes in a chat thread. Nothing connects.",
  },
  {
    title: "Returning clients look like strangers",
    description:
      "Someone you tattooed last year messages again, and you are scrolling old chats trying to reconstruct what you did and how it went.",
  },
  {
    title: "Session context disappears",
    description:
      "Placement, size, references, and timing were all in the request, but by appointment week they are buried under newer messages.",
  },
  {
    title: "Notes do not survive the inbox",
    description:
      "Skin sensitivity, style preferences, how the last session went: memory and chat scrollback are not a system.",
  },
  {
    title: "Spreadsheets need feeding",
    description:
      "A client spreadsheet only works if you maintain it after every booking, which is exactly the admin that gets skipped.",
  },
];

const RECORD_POINTS: Item[] = [
  {
    title: "Records build themselves",
    description:
      "Every booking request creates or updates the client's record automatically. No data entry, no importing, no upkeep.",
  },
  {
    title: "Contact details stay attached",
    description:
      "Email and Instagram handle stay connected to the client, exactly as they arrived with the request.",
  },
  {
    title: "Tattoo and booking history",
    description:
      "Every request from that client with placement, size, dates, booking status, and deposit amounts, in one view instead of scattered chats.",
  },
  {
    title: "Private notes",
    description:
      "Keep your own notes per client: style preferences, session details, anything worth remembering. Only you can see them.",
  },
  {
    title: "Returning clients are obvious",
    description:
      "Booking counts and history make repeat clients visible at a glance, so a familiar name never gets treated like a cold request.",
  },
];

const CONTEXT_ITEMS: Item[] = [
  {
    title: "Search on the go",
    description:
      "In the Inklee mobile app, search your clients by Instagram handle or email. On the web, the full client list lives next to your bookings.",
  },
  {
    title: "Clients never need an account",
    description:
      "Client records exist for you. Your clients just send requests and get emails; they never sign up for anything.",
  },
  {
    title: "Not a marketing database",
    description:
      "There are no newsletters, campaigns, or lead scoring here. Client data stays scoped to bookings, which is what artists and GDPR both prefer.",
  },
  {
    title: "Connected to the rest of the flow",
    description:
      "The same record ties into deposits and reminders, so payment status and appointment follow-ups always know who they are about.",
  },
];

const OUTCOME_ITEMS: Array<Item & { variant: "mustard" | "bone" | "rosa" }> = [
  {
    title: "Recognize the regulars",
    description:
      "See who keeps coming back and treat them like it, without archaeology in your DMs.",
    variant: "mustard",
  },
  {
    title: "Walk in with context",
    description:
      "Before a session or a reply, one look at the record shows the history, the notes, and the open deposit.",
    variant: "bone",
  },
  {
    title: "Notes that outlive your memory",
    description:
      "What you noted after the last session is still there at the next request, even a year later.",
    variant: "rosa",
  },
  {
    title: "Zero maintenance",
    description:
      "The list stays current because it is built from the bookings themselves, not from your discipline with a spreadsheet.",
    variant: "bone",
  },
];

const CLIENTS_FAQ: Faq[] = [
  {
    question: "How are client records created?",
    answer:
      "Automatically. When someone submits a booking request, Inklee creates or updates their client record from it. There is no manual data entry and nothing to import.",
  },
  {
    question: "What is in a tattoo client record?",
    answer:
      "Contact details (email and Instagram handle), every booking request with placement, size, dates, and status, deposit amounts where relevant, and your private notes.",
  },
  {
    question: "Can I keep private notes on a client?",
    answer:
      "Yes. Each client has a notes field only you can see: style preferences, session details, whatever helps next time.",
  },
  {
    question: "Can I search my client list?",
    answer:
      "In the mobile app you can search by Instagram handle or email. On the web, the full client list is part of your bookings workspace.",
  },
  {
    question: "Is Inklee a CRM for tattoo artists?",
    answer:
      "It covers what most artists actually need from a CRM: client information, history, and notes connected to bookings. It is not an enterprise CRM: there is no marketing automation, no sales pipeline, and no lead scoring.",
  },
  {
    question: "Can I send newsletters or campaigns to my clients?",
    answer:
      "No. Inklee is not a marketing tool. Client emails are used for booking communication like confirmations, reminders, and deposit follow-ups.",
  },
  {
    question: "Do my clients see their record or need an account?",
    answer:
      "No. Records are private to you. Clients only interact with your booking page and the emails about their own bookings.",
  },
  {
    question: "Does client history include deposits?",
    answer:
      "Yes. A client's booking history shows the deposit amounts and status connected to each booking, so money context is never separate from the person.",
  },
];

const RELATED_LINKS: Related[] = [
  {
    title: "Tattoo Booking Software",
    href: "/tattoo-booking-software",
    description:
      "The full booking flow: structured requests, artist review, deposits, waitlist, and guest spots in one system.",
  },
  {
    title: "Tattoo Booking Form",
    href: "/tattoo-booking-form",
    description:
      "The structured request form that feeds every client record: idea, placement, size, references, and contact.",
  },
  {
    title: "Tattoo Appointment Reminders",
    href: "/tattoo-appointment-reminders",
    description:
      "Automatic reminder emails and deposit follow-ups that already know which client and booking they are about.",
  },
];

export default function TattooClientManagementPage() {
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
      <JsonLd data={faqPageSchema(CLIENTS_FAQ)} id="ld-faq" />
      <PillNav />
      <main className="flex-1">
        <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
          <div className="container-marketing-wide">
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
              <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                  Tattoo client management software
                </p>
                <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  <span className="block">Client records that</span>
                  <span className="block text-brand-mustard">
                    build themselves.
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                  Every booking request becomes a client record: contact info,
                  tattoo history, deposits, and your private notes. No
                  spreadsheet to maintain, no data entry.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
                  <TrackedCtaLink
                    cta="hero-signup"
                    href="/signup"
                    className="inline-flex items-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
                  >
                    Create your booking link
                  </TrackedCtaLink>
                  <Link
                    href="/tattoo-booking-form"
                    className="inline-flex items-center rounded-full border-[1.5px] border-shell-border px-6 py-3 text-base font-bold text-shell-fg-dim transition-colors hover:border-shell-fg hover:text-foreground"
                  >
                    See the booking form →
                  </Link>
                </div>
                <div className="mt-6 flex items-center gap-3 md:mt-10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/branding/badges/badge-handmade.svg"
                    alt="Made by hand"
                    className="h-12 w-12 md:h-14 md:w-14"
                    draggable={false}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/branding/badges/badge-gdpr.svg"
                    alt="GDPR compliant"
                    className="h-12 w-12 md:h-14 md:w-14"
                    draggable={false}
                  />
                </div>
              </div>
              <div className="order-1 flex justify-center pt-5 md:order-2 md:pt-0">
                <div className="animate-hero-float w-full max-w-xs md:max-w-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/branding/illustrations/feature-requests.svg"
                    alt=""
                    aria-hidden="true"
                    className="h-auto w-full"
                    draggable={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[6fr_6fr] md:gap-16">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/illustrations/mixed/inklee-_contact-form.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-auto w-full max-w-lg md:mx-0"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  Client management, native to the booking flow
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  Your clients are already
                  <br />
                  in your bookings.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Every complete tattoo request already contains the client: who
                  they are, what they want, and how to reach them. Inklee keeps
                  that as a living record instead of letting it sink into chat
                  history.
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Client information, client notes, and tattoo history, kept in
                  the same system that handles your requests, deposits, and
                  reminders.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                  Why DM archaeology fails
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                  Scrollback is not
                  <br />
                  client management.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-shell-fg-dim md:text-lg">
                  The information exists. It is just spread across chats, notes
                  apps, and memory, where it quietly expires.
                </p>
              </div>
              <div className="space-y-4 md:space-y-5">
                {PROBLEM_POINTS.map((p, i) => {
                  const variants = [
                    "mustard",
                    "bone",
                    "rosa",
                    "bone",
                    "mustard",
                  ];
                  const v = variants[i % variants.length];
                  const bgClass =
                    v === "mustard"
                      ? "bg-brand-mustard"
                      : v === "rosa"
                        ? "bg-brand-rosa"
                        : "bg-brand-bone";
                  return (
                    <div
                      key={p.title}
                      className={`flex flex-col gap-2 rounded-3xl p-6 md:p-7 ${bgClass}`}
                    >
                      <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                        {p.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-brand-charcoal/75">
                        {p.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-brand-mustard">
          <div className="container-marketing py-20 md:py-28">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                What Inklee keeps for you
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                One record per client.
                <br />
                Built from real bookings.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                No setup and no imports. The client list assembles itself from
                the requests you already receive.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {RECORD_POINTS.map((s, i) => (
                <div
                  key={s.title}
                  className="flex flex-col gap-3 rounded-3xl bg-brand-charcoal/8 p-5"
                >
                  <span className="text-3xl font-black leading-none text-brand-charcoal md:text-4xl">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-base font-black leading-tight text-brand-charcoal">
                    {s.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-brand-charcoal/75">
                    {s.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                Honest boundaries
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Built for artists,
                <br />
                not for sales teams.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-6">
              {CONTEXT_ITEMS.map((item, i) => {
                const variants = ["mustard", "bone-card", "rosa", "bone-card"];
                const v = variants[i];
                const bgClass =
                  v === "mustard"
                    ? "bg-brand-mustard"
                    : v === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-[#d9d4c7]";
                return (
                  <div
                    key={item.title}
                    className={`flex h-full flex-col gap-3 rounded-3xl p-7 ${bgClass}`}
                  >
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-charcoal/70">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-2xl font-black leading-tight text-brand-charcoal">
                      {item.title}
                    </h3>
                    <p className="text-base leading-relaxed text-brand-charcoal/75">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-2xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                What changes
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                Know your clients.
                <br />
                Skip the admin.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-6">
              {OUTCOME_ITEMS.map((item) => {
                const bgClass =
                  item.variant === "mustard"
                    ? "bg-brand-mustard"
                    : item.variant === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-brand-bone";
                return (
                  <div
                    key={item.title}
                    className={`flex h-full flex-col gap-3 rounded-3xl p-7 ${bgClass}`}
                  >
                    <h3 className="text-2xl font-black leading-tight text-brand-charcoal">
                      {item.title}
                    </h3>
                    <p className="text-base leading-relaxed text-brand-charcoal/75">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-24 md:py-32">
            <div className="mx-auto max-w-3xl">
              <div className="mb-12 text-center">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  FAQ
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
                  Tattoo client management, answered.
                </h2>
              </div>
              <div className="rounded-3xl border-[1.5px] border-brand-charcoal/15 bg-[#d9d4c7] px-6 md:px-10">
                {CLIENTS_FAQ.map((item, idx) => {
                  const number = String(idx + 1).padStart(2, "0");
                  const isLast = idx === CLIENTS_FAQ.length - 1;
                  return (
                    <details
                      key={item.question}
                      className={`group py-5 ${isLast ? "" : "border-b border-brand-charcoal/15"}`}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                        <div className="flex items-baseline gap-5">
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-charcoal/70">
                            {number}
                          </span>
                          <span className="text-lg font-bold text-brand-charcoal">
                            {item.question}
                          </span>
                        </div>
                        <span
                          aria-hidden="true"
                          className="text-2xl font-black text-brand-charcoal/60 transition-transform group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <p className="mt-3 max-w-2xl pl-[3.25rem] text-sm leading-relaxed text-brand-charcoal/75">
                        {item.answer}
                      </p>
                    </details>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="mb-12 max-w-2xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                More to read
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
                Build the rest of
                <br />
                your booking flow.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              {RELATED_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex h-full flex-col justify-between gap-6 rounded-3xl border-[1.5px] border-brand-charcoal/15 p-6 transition-colors hover:border-brand-charcoal/40 hover:bg-[#d9d4c7]"
                >
                  <div className="space-y-3">
                    <h3 className="text-xl font-black leading-tight text-brand-charcoal">
                      {link.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-brand-charcoal/75">
                      {link.description}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-brand-charcoal/70 transition-colors group-hover:text-brand-charcoal">
                    Read more →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-brand-rosa">
          <div className="container-marketing py-20 md:py-28">
            <div className="mx-auto max-w-3xl text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/illustrations/easy-peasy.svg"
                alt=""
                aria-hidden="true"
                className="mx-auto mb-8 h-28 w-auto md:h-36"
                draggable={false}
              />
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-6xl lg:text-7xl">
                Stop losing clients
                <br />
                to your own inbox.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Let the booking flow build your client list for you.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <TrackedCtaLink
                  cta="final-signup"
                  href="/signup"
                  className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
                >
                  Create your booking link
                </TrackedCtaLink>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
