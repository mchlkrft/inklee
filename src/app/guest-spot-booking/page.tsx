import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

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
    title: "Requests from different cities land in the same inbox",
    description:
      "Berlin asks about your spring trip, London asks about last year's, and someone DMs you for a city you have not even confirmed yet, all in the same thread.",
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
    title: "Hard to judge demand before planning the next trip",
    description:
      "Without a way to see city interest in one place, planning where to travel next becomes a guess rather than a decision.",
  },
];

const SOLUTION_POINTS: Item[] = [
  {
    title: "Collect guest spot requests from bio, stories, and replies",
    description:
      "One Inklee link covers every surface where clients see your travel announcement and ask to book.",
  },
  {
    title: "Ask for city, timing, idea, placement, size, and references",
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

const FLOW_FEATURES: Item[] = [
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

const COMPARISON_ROWS: Comparison[] = [
  {
    feature: "City demand",
    alt: "Mixed into one inbox",
    inklee: "Collected with city and location context",
  },
  {
    feature: "Travel dates",
    alt: "Often mentioned once, then buried",
    inklee: "Connected to the booking request",
  },
  {
    feature: "Tattoo details",
    alt: "Spread across multiple messages",
    inklee: "Collected in one tattoo request form",
  },
  {
    feature: "Booking window",
    alt: "Hard to track who fits the trip",
    inklee: "Easier to review before confirming",
  },
  {
    feature: "Waitlist",
    alt: "Demand disappears after books close",
    inklee: "Future demand stays easier to read",
  },
  {
    feature: "Artist control",
    alt: "Conversation can turn into accidental commitments",
    inklee: "Artist reviews before anything becomes a booking",
  },
];

const AUDIENCE_CARDS: Array<Item & { variant: "mustard" | "bone" | "rosa" }> = [
  {
    title: "International guest spot artists",
    description:
      "For artists moving between countries with city-specific booking windows.",
    variant: "mustard",
  },
  {
    title: "Regional traveling artists",
    description:
      "For artists hopping between nearby cities, conventions, or short-term work periods.",
    variant: "bone",
  },
  {
    title: "Studio visit artists",
    description: "For artists doing rotating guest sessions in friend studios.",
    variant: "rosa",
  },
  {
    title: "Convention-only artists",
    description:
      "For artists who only take bookings around event dates and want demand structured by city.",
    variant: "bone",
  },
];

const GUEST_SPOT_FAQ: Faq[] = [
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
    title: "Guest spots feature page",
    href: "/guest-spots",
    description:
      "See the existing guest spots page and how Inklee frames travel-based booking.",
  },
];

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
      <PillNav />
      <main className="flex-1">
        <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
          <div className="container-marketing-wide">
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
              <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                  Guest spot booking for tattoo artists
                </p>
                <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  <span className="block">Guest spot bookings,</span>
                  <span className="block text-brand-mustard">
                    without the DM mess.
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                  Organize tattoo guest spot requests by city, travel dates,
                  client details, and references. One link replaces ten DM
                  threads.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
                  <Link
                    href="/signup"
                    className="inline-flex items-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
                  >
                    Create your booking link
                  </Link>
                  <Link
                    href="/guest-spots"
                    className="inline-flex items-center rounded-full border-[1.5px] border-shell-border px-6 py-3 text-base font-bold text-shell-fg-dim transition-colors hover:border-shell-fg hover:text-foreground"
                  >
                    See the guest spots feature →
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
                <div className="animate-hero-float w-full max-w-sm md:max-w-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/branding/illustrations/mixed/inklee-_artist-guestspot.svg"
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
                  src="/branding/illustrations/mixed/inklee-_Travel-Date-Form.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-auto w-full max-w-lg md:mx-0"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  Travel-aware tattoo booking
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  Built for the way
                  <br />
                  traveling artists actually work.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Tattoo guest spot booking is not just normal booking from a
                  different city. It needs to handle travel dates, city demand,
                  limited booking windows, and the spike of interest that comes
                  with a guest spot announcement.
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Inklee gives traveling tattoo artists a structured way to
                  collect city-based requests, separate them from regular
                  booking noise, and review what fits before any time is locked
                  in.
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
                  Where guest spot DMs break
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                  Five cities.
                  <br />
                  One messy inbox.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-shell-fg-dim md:text-lg">
                  Without a structured intake, every trip request is missing
                  half the context, mixed with old conversations, and easy to
                  miss.
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
                The Inklee guest-spot flow
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                Cities sorted.
                <br />
                Requests structured.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Inklee replaces guest spot DMs with a tattoo request form that
                captures city, travel dates, and the full request context up
                front.
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
                What the flow includes
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Six pieces of a guest spot
                <br />
                booking flow that works.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 md:gap-6">
              {FLOW_FEATURES.map((f, i) => {
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
                Guest spots in DMs vs in Inklee
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                One trip.
                <br />
                Two ways to handle it.
              </h2>
            </div>
            <div className="overflow-hidden rounded-3xl border-[1.5px] border-shell-border bg-[#252525]">
              <div className="grid grid-cols-1 gap-px bg-shell-border md:grid-cols-3">
                <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-shell-fg-dim">
                  Feature
                </div>
                <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-shell-fg-dim">
                  DMs alone
                </div>
                <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-mustard">
                  Inklee guest spot flow
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
                Built for traveling
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
                  Guest spot bookings, answered.
                </h2>
              </div>
              <div className="rounded-3xl border-[1.5px] border-shell-border bg-[#252525] px-6 md:px-10">
                {GUEST_SPOT_FAQ.map((item, idx) => {
                  const number = String(idx + 1).padStart(2, "0");
                  const isLast = idx === GUEST_SPOT_FAQ.length - 1;
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
                Stop chasing guest spot
                <br />
                requests across cities.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                One booking link. Every city. Every trip.
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
