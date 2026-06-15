import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

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
type Comparison = { feature: string; alt: string; inklee: string };
type Faq = { question: string; answer: string };
type Related = { title: string; description: string; href: string };

const PROBLEM_POINTS: Item[] = [
  {
    title: "Clients send references without placement or size",
    description:
      "An image lands in your inbox without context. You ask for placement. They reply tomorrow. Nothing moves until the basics arrive.",
  },
  {
    title: "Serious requests mix with reactions and casual chat",
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
      "If the path from interest to request is fuzzy, motivated clients lose momentum before anything is booked.",
  },
];

const SOLUTION_POINTS: Item[] = [
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

const LINK_FIELDS: Item[] = [
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

const COMPARISON_ROWS: Comparison[] = [
  {
    feature: "First contact",
    alt: "Easy and familiar",
    inklee: "Still starts from Instagram, but gives serious requests structure",
  },
  {
    feature: "Request details",
    alt: "Spread across multiple messages",
    inklee: "Collected in one tattoo request form",
  },
  {
    feature: "References",
    alt: "Easy to lose in the scroll",
    inklee: "Attached to the request context",
  },
  {
    feature: "Artist decision",
    alt: "Hard to track what has been answered",
    inklee: "Easier to review before approving",
  },
  {
    feature: "Guest spots",
    alt: "City requests mix with everything else",
    inklee: "Easier to separate location-based demand",
  },
];

const AUDIENCE_CARDS: Array<Item & { variant: "mustard" | "bone" | "rosa" }> = [
  {
    title: "Instagram-first tattoo artists",
    description:
      "For tattooers whose clients find them through bio, stories, and DM replies.",
    variant: "mustard",
  },
  {
    title: "Solo artists handling their own intake",
    description: "For artists who reply to every booking question themselves.",
    variant: "bone",
  },
  {
    title: "Traveling guest spot artists",
    description:
      "For artists running guest spots and needing city demand separated from local requests.",
    variant: "rosa",
  },
  {
    title: "Closed-books waitlist artists",
    description:
      "For artists who want a clean path even when their books are not actively open.",
    variant: "bone",
  },
];

const INSTAGRAM_FAQ: Faq[] = [
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

const RELATED_LINKS: Related[] = [
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
      <PillNav />
      <main className="flex-1">
        <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
          <div className="container-marketing-wide">
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
              <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                  Instagram booking link for tattoo artists
                </p>
                <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  <span className="block">One booking link</span>
                  <span className="block text-brand-mustard">
                    for tattoo requests from Instagram.
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                  Drop it in your bio, your stories, or your DM replies. Real
                  booking requests land in a structured flow instead of
                  scattered messages.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
                  <Link
                    href="/signup"
                    className="inline-flex items-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
                  >
                    Create your booking link
                  </Link>
                  <Link
                    href="/dm-chaos"
                    className="inline-flex items-center rounded-full border-[1.5px] border-shell-border px-6 py-3 text-base font-bold text-shell-fg-dim transition-colors hover:border-shell-fg hover:text-foreground"
                  >
                    See how it fixes DM chaos →
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
                <div className="animate-hero-float w-full max-w-2xs md:max-w-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/branding/illustrations/mixed/inklee-_instagram-link-mobile.svg"
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
                  src="/branding/illustrations/mixed/inklee-_DM-to-Booking-Form.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-auto w-full max-w-lg md:mx-0"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  From Instagram to a real request
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  The cleanest path from
                  <br />
                  bio click to booking.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  An Instagram booking link for tattoo artists turns the
                  &ldquo;DM me to book&rdquo; loop into one clean next step.
                  Clients click the link, fill in the tattoo request, and
                  serious bookings land with the details you need to review
                  them.
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Inklee is built for solo and traveling tattoo artists who want
                  Instagram as the front door, just not the whole booking
                  system.
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
                  Where DMs leak
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                  Instagram pulls clients in.
                  <br />
                  DMs lose the request.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-shell-fg-dim md:text-lg">
                  The reach is great. The intake is not. Booking requests get
                  fragmented across reactions, story replies, and casual
                  messages.
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
                What the link does
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                One link.
                <br />
                Every booking entry point.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                The same Inklee link works from bio, stories, highlights, and
                replies. It turns scattered booking interest into a structured
                request flow.
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

        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                What the link collects
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Six fields, one tattoo
                <br />
                request worth replying to.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 md:gap-6">
              {LINK_FIELDS.map((f, i) => {
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

        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                DMs alone vs Instagram + booking link
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                Same Instagram.
                <br />
                Cleaner booking flow.
              </h2>
            </div>
            <div className="overflow-hidden rounded-3xl border-[1.5px] border-shell-border bg-[#252525]">
              <div className="grid grid-cols-1 gap-px bg-shell-border md:grid-cols-3">
                <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-shell-fg-dim">
                  Feature
                </div>
                <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-shell-fg-dim">
                  Instagram DMs alone
                </div>
                <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-mustard">
                  Instagram + Inklee link
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
          </div>
        </section>

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
                Built for Instagram-first
                <br />
                tattoo artists.
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

        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mx-auto max-w-3xl">
              <div className="mb-12 text-center">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                  FAQ
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl">
                  Instagram booking links, answered.
                </h2>
              </div>
              <div className="rounded-3xl border-[1.5px] border-shell-border bg-[#252525] px-6 md:px-10">
                {INSTAGRAM_FAQ.map((item, idx) => {
                  const number = String(idx + 1).padStart(2, "0");
                  const isLast = idx === INSTAGRAM_FAQ.length - 1;
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
                Keep going.
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
                Stop losing tattoo requests
                <br />
                in your Instagram inbox.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Put one clean booking link in your bio and let serious requests
                flow into a real intake.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
                >
                  Create your booking link
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
