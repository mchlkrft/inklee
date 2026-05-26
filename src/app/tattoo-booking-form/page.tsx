import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

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

/* ─── SEO content ──────────────────────────────────────────────────────── */

type Item = { title: string; description: string };
type Comparison = { feature: string; alt: string; inklee: string };
type Faq = { question: string; answer: string };
type Related = { title: string; description: string; href: string };

const PROBLEM_POINTS: Item[] = [
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
      "A traveling-client request without a city forces the artist to ask, then wait, then ask again, usually after the trip is already locked in.",
  },
  {
    title: "Artists repeating the same intake questions every week",
    description:
      "Placement. Size. References. Timing. Same questions, copy-pasted into a different DM, every single week.",
  },
];

const SOLUTION_POINTS: Item[] = [
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
    title: "Use the same flow from bio, replies, or guest spot announcements",
    description:
      "One link, one form. It works the same whether the client found you through bio, stories, a DM reply, or a city announcement.",
  },
];

const FORM_FIELDS: Item[] = [
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
];

const COMPARISON_ROWS: Comparison[] = [
  {
    feature: "Request context",
    alt: "Short message field",
    inklee: "Idea, placement, size, references, timing, and contact",
  },
  {
    feature: "Reference images",
    alt: "Often missing or sent separately",
    inklee: "Attached to the request context",
  },
  {
    feature: "Artist approval",
    alt: "Usually just sends a message",
    inklee: "Supports review before confirmation",
  },
  {
    feature: "Instagram workflow",
    alt: "Often disconnected from bio and DMs",
    inklee: "Works as the next step from Instagram inquiries",
  },
  {
    feature: "Guest spots",
    alt: "Usually no city or travel context",
    inklee: "Can support location and guest spot demand",
  },
  {
    feature: "Booking clarity",
    alt: "Creates more follow-up questions",
    inklee: "Reduces repeated intake questions",
  },
];

const AUDIENCE_CARDS: Array<Item & { variant: "mustard" | "bone" | "rosa" }> = [
  {
    title: "Solo tattoo artists",
    description:
      "For artists who handle their own intake without hiring a front desk.",
    variant: "mustard",
  },
  {
    title: "Instagram-first artists",
    description:
      "For tattooers using Instagram bio + replies as their booking entry point.",
    variant: "bone",
  },
  {
    title: "Traveling guest spot artists",
    description:
      "For artists moving between cities, studios, and limited booking windows.",
    variant: "rosa",
  },
  {
    title: "Custom-work artists",
    description:
      "For artists who need to review the idea before saying yes to a slot.",
    variant: "bone",
  },
];

const FORM_FAQ: Faq[] = [
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

const RELATED_LINKS: Related[] = [
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

/* ─── Page ─────────────────────────────────────────────────────────────── */

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
      <PillNav />
      <main className="flex-1">
        {/* ── Hero (charcoal) ───────────────────────────────────────── */}
        <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
          <div className="container-marketing-wide">
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
              <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                  Tattoo booking form for artists
                </p>
                <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  <span className="block">A tattoo booking form</span>
                  <span className="block text-brand-mustard">
                    for real tattoo requests.
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                  Collect the idea, placement, size, references, timing, and
                  contact details before you spend another afternoon asking the
                  same questions in DMs.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
                  <Link
                    href="/signup"
                    className="inline-flex items-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
                  >
                    Build your tattoo request form
                  </Link>
                  <Link
                    href="/tattoo-booking-software"
                    className="inline-flex items-center rounded-full border-[1.5px] border-shell-border px-6 py-3 text-base font-bold text-shell-fg-dim transition-colors hover:border-shell-fg hover:text-foreground"
                  >
                    See the booking tool page →
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
              <div className="order-1 flex justify-center pt-5 md:order-2 md:-mr-8 md:justify-end md:pt-0 lg:-mr-16">
                <div className="animate-hero-float w-full max-w-sm md:max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/branding/illustrations/mixed/inklee-_contact-form.svg"
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

        {/* ── Definition (bone) ─────────────────────────────────────── */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[6fr_6fr] md:gap-16">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/illustrations/mixed/inklee-_inklee-form-yellow.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-auto w-full max-w-lg md:mx-0"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  Tattoo intake, not a generic contact form
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  A good tattoo form helps
                  <br />
                  you decide before you reply.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  A tattoo booking form is not just a name, email, and message
                  box. It should collect the details that actually change the
                  work: the idea, body placement, size, references, timing, and
                  how the client can be reached.
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Inklee turns that first messy request into a cleaner tattoo
                  intake flow. Clients send the context first, and the artist
                  can review whether the piece fits their style, schedule, or
                  booking window before confirming anything.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Problem (charcoal) ────────────────────────────────────── */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                  Where requests fall apart
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                  Most tattoo requests arrive
                  <br />
                  half-finished.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-shell-fg-dim md:text-lg">
                  A client might send a screenshot, ask for a price, forget the
                  placement, skip the size, and then disappear before the artist
                  has enough information to answer properly.
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

        {/* ── Solution (mustard) ────────────────────────────────────── */}
        <section className="bg-brand-mustard">
          <div className="container-marketing py-20 md:py-28">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                How Inklee fixes it
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                A better form gets the
                <br />
                important details first.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                With Inklee, the client sends a structured tattoo request before
                the artist decides what happens next. That makes the first reply
                faster, clearer, and less dependent on digging through chat
                history.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {SOLUTION_POINTS.map((s, i) => (
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

        {/* ── Form fields (bone) ────────────────────────────────────── */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                Fields the form should include
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Six fields that make
                <br />a tattoo request useful.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                The exact form can change from artist to artist, but these
                fields are the difference between a useful request and another
                vague message.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 md:gap-6">
              {FORM_FIELDS.map((f, i) => {
                const variants = [
                  "mustard",
                  "bone-card",
                  "rosa",
                  "rosa",
                  "mustard",
                  "bone-card",
                ];
                const v = variants[i];
                const bgClass =
                  v === "mustard"
                    ? "bg-brand-mustard"
                    : v === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-[#d9d4c7]";
                return (
                  <div
                    key={f.title}
                    className={`flex h-full flex-col gap-3 rounded-3xl p-6 ${bgClass}`}
                  >
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-charcoal/70">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                      {f.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-brand-charcoal/75">
                      {f.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Comparison (charcoal) ─────────────────────────────────── */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Side by side
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                Generic contact form
                <br />
                vs tattoo booking form.
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-shell-fg-dim">
                A basic form can collect a message. A tattoo request form should
                collect enough context for the artist to make a decision.
              </p>
            </div>
            <div className="overflow-hidden rounded-3xl border-[1.5px] border-shell-border bg-[#252525]">
              <div className="grid grid-cols-1 gap-px bg-shell-border md:grid-cols-3">
                <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-shell-fg-dim">
                  Feature
                </div>
                <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-shell-fg-dim">
                  Generic contact form
                </div>
                <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-mustard">
                  Inklee tattoo form
                </div>
                {COMPARISON_ROWS.map((row) => (
                  <div key={row.feature} className="contents">
                    <div className="bg-[#252525] px-5 py-4 text-sm font-bold text-shell-fg">
                      {row.feature}
                    </div>
                    <div className="bg-[#252525] px-5 py-4 text-sm text-shell-fg-dim">
                      {row.alt}
                    </div>
                    <div className="bg-[#252525] px-5 py-4 text-sm text-shell-fg">
                      {row.inklee}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-6 max-w-2xl text-sm text-shell-fg-dim">
              The goal is not to make clients fill out a tax return. The goal is
              to collect enough detail so the artist can answer properly.
            </p>
          </div>
        </section>

        {/* ── Audience (bone) ───────────────────────────────────────── */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-2xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                Who it is for
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Built for artists who choose
                <br />
                what gets booked.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-6">
              {AUDIENCE_CARDS.map((a) => {
                const bgClass =
                  a.variant === "mustard"
                    ? "bg-brand-mustard"
                    : a.variant === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-[#d9d4c7]";
                return (
                  <div
                    key={a.title}
                    className={`flex h-full flex-col gap-3 rounded-3xl p-7 ${bgClass}`}
                  >
                    <h3 className="text-2xl font-black leading-tight text-brand-charcoal">
                      {a.title}
                    </h3>
                    <p className="text-base leading-relaxed text-brand-charcoal/75">
                      {a.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── FAQ (charcoal) ────────────────────────────────────────── */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mx-auto max-w-3xl">
              <div className="mb-12 text-center">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                  FAQ
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl">
                  Tattoo booking forms, answered.
                </h2>
              </div>
              <div className="rounded-3xl border-[1.5px] border-shell-border bg-[#252525] px-6 md:px-10">
                {FORM_FAQ.map((item, idx) => {
                  const number = String(idx + 1).padStart(2, "0");
                  const isLast = idx === FORM_FAQ.length - 1;
                  return (
                    <details
                      key={item.question}
                      className={`group py-5 ${isLast ? "" : "border-b border-shell-border"}`}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                        <div className="flex items-baseline gap-5">
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-mustard">
                            {number}
                          </span>
                          <span className="text-lg font-bold text-shell-fg">
                            {item.question}
                          </span>
                        </div>
                        <span
                          aria-hidden="true"
                          className="text-2xl font-black text-shell-fg-dim transition-transform group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <p className="mt-3 max-w-2xl pl-[3.25rem] text-sm leading-relaxed text-shell-fg-dim">
                        {item.answer}
                      </p>
                    </details>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── Related (bone) ────────────────────────────────────────── */}
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
                Keep the request flow
                <br />
                connected.
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

        {/* ── Final CTA (rosa) ──────────────────────────────────────── */}
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
                Stop starting every tattoo
                <br />
                request from zero.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Give clients one place to send the tattoo details you actually
                need.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
                >
                  Build your tattoo request form
                </Link>
                <Link
                  href="/bert-grimm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full border-[1.5px] border-brand-charcoal px-6 py-3 text-base font-bold text-brand-charcoal transition-colors hover:bg-brand-charcoal/8"
                >
                  See a live example →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
