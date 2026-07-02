import type { Metadata } from "next";
import Link from "next/link";
import TrackedCtaLink from "@/components/tracked-cta-link";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

const PAGE_PATH = "/tattoo-artist-waitlist";
const PAGE_TITLE = "Tattoo waitlist software for artists · Inklee";
const PAGE_DESCRIPTION =
  "Tattoo waitlist software that keeps future demand organized. Hold requests for closed books, guest spots, and booking waves, and fill cancellations fast.";
const OG_TITLE = "Tattoo waitlist software for artists";
const OG_DESCRIPTION =
  "Keep future tattoo requests visible when books are closed, guest spots fill up, or clients need to wait for the next booking window.";

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
    title: "Good requests disappear in DMs",
    description:
      "When books are closed, serious clients still message you, but their requests can get buried before you are ready to reopen.",
  },
  {
    title: "No useful request context",
    description:
      "A name on a list is not enough if you cannot remember the idea, placement, size, references, or timing later.",
  },
  {
    title: "Guest spot demand gets mixed up",
    description:
      "Requests from different cities become hard to compare when every location lives in the same inbox or spreadsheet.",
  },
  {
    title: "No clear follow-up status",
    description:
      "Without status tracking, it is easy to forget who was contacted, who replied, and who already moved forward.",
  },
  {
    title: "Demand disappears after books reopen",
    description:
      "If the waitlist is not connected to the booking flow, the next booking window starts from chaos again.",
  },
];

const SOLUTION_POINTS: Item[] = [
  {
    title: "Structured waitlist entries",
    description:
      "Clients can leave useful request details instead of sending vague “let me know when books open” messages.",
  },
  {
    title: "Request context stays visible",
    description:
      "Idea, placement, size, references, contact details, and timing stay easier to review when the artist comes back later.",
  },
  {
    title: "Cleaner books closed flow",
    description:
      "When books are closed, artists can still collect future interest without pretending every request can be booked right now.",
  },
  {
    title: "Better guest spot planning",
    description:
      "Waitlist demand can help artists understand which cities have serious interest before planning another trip.",
  },
  {
    title: "Easier follow-up later",
    description:
      "Status handling makes it easier to see who is waiting, who was contacted, and which requests might move forward.",
  },
];

const FIELDS_ITEMS: Item[] = [
  {
    title: "Tattoo idea",
    description:
      "The waitlist should capture what the client actually wants, not just their name and contact.",
  },
  {
    title: "Placement and size",
    description:
      "Body area and rough size help the artist judge whether the request fits future availability.",
  },
  {
    title: "References",
    description:
      "Reference images or links make the request easier to understand when the artist reviews it later.",
  },
  {
    title: "City and timing",
    description:
      "For guest spots and travel artists, location and date context can make waitlist demand much more useful.",
  },
];

const SCENARIO_CARDS: Array<Item & { variant: "mustard" | "bone" | "rosa" }> = [
  {
    title: "Books are closed",
    description:
      "Artists can collect future interest without turning the inbox into a pile of unread booking requests.",
    variant: "mustard",
  },
  {
    title: "Guest spot is full",
    description:
      "Clients who missed the current city window can still stay visible for the next trip.",
    variant: "bone",
  },
  {
    title: "Demand by city",
    description:
      "Traveling artists can see where people are waiting before deciding where to go next.",
    variant: "rosa",
  },
  {
    title: "Long lead times",
    description:
      "Artists with bigger projects or limited availability can keep future requests organized.",
    variant: "bone",
  },
];

const WAITLIST_FAQ: Faq[] = [
  {
    question: "Should tattoo artists have a waitlist?",
    answer:
      "A waitlist can help when an artist gets more serious requests than they can book right now. It keeps future demand visible instead of letting good requests disappear in DMs.",
  },
  {
    question: "What is the difference between a waitlist and saved DMs?",
    answer:
      "Saved DMs are still scattered chats. A useful tattoo waitlist keeps request details, contact information, timing, and status together so the artist can review them later.",
  },
  {
    question: "How do guest spots affect waitlist needs?",
    answer:
      "Guest spots create city-based demand. A waitlist can help artists see who is interested in a specific location after the current booking window is full.",
  },
  {
    question: "How long should I keep someone on a tattoo waitlist?",
    answer:
      "That depends on your workflow, booking windows, and client communication style. The important part is to set expectations clearly so clients know what waiting means.",
  },
  {
    question: "Should I contact waitlist entries in order?",
    answer:
      "Not always. Some artists work by order, while others choose based on style fit, project size, location, or available dates. The process should match your booking policy.",
  },
  {
    question: "What happens when my books reopen?",
    answer:
      "When books reopen, the artist can review waitlist entries, contact suitable clients, and move the right requests forward instead of starting from a messy inbox.",
  },
  {
    question: "Can a waitlist help me decide where to travel next?",
    answer:
      "Yes. For guest spot artists, city-based waitlist demand can show where people are interested before planning another trip.",
  },
  {
    question: "Do I need a separate waitlist tool?",
    answer:
      "A separate list can work at low volume, but it often becomes messy. Inklee keeps waitlist interest connected to tattoo requests, booking states, and guest spot context.",
  },
];

const RELATED_LINKS: Related[] = [
  {
    title: "Guest Spot Booking",
    href: "/guest-spot-booking",
    description:
      "See how Inklee helps traveling artists organize requests around cities, dates, and booking windows.",
  },
  {
    title: "Tattoo Deposit Tool",
    href: "/tattoo-deposit-tool",
    description:
      "Learn how deposit status can stay connected to the booking flow instead of scattered across DMs.",
  },
  {
    title: "Tattoo Booking Form",
    href: "/tattoo-booking-form",
    description:
      "See what details a tattoo request form should collect before an artist says yes.",
  },
];

export default function WaitlistPage() {
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
      <JsonLd data={faqPageSchema(WAITLIST_FAQ)} id="ld-faq" />
      <PillNav />
      <main className="flex-1">
        {/* Hero (charcoal) */}
        <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
          <div className="container-marketing-wide">
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
              <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                  Waitlist for tattoo artists
                </p>
                <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  <span className="block">Keep future tattoo</span>
                  <span className="block text-brand-mustard">
                    requests visible.
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                  When your books are closed or a guest spot fills up, serious
                  requests should not disappear into DMs. Inklee keeps future
                  demand organized as part of your booking flow.
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
                    href="/bert-grimm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border-[1.5px] border-shell-border px-6 py-3 text-base font-bold text-shell-fg-dim transition-colors hover:border-shell-fg hover:text-foreground"
                  >
                    See a live example →
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
                    src="/branding/illustrations/mixed/inklee-_artist-shows-inklee-app.svg"
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

        {/* Definition (bone) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[6fr_6fr] md:gap-16">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/illustrations/mixed/inklee-_artist-using-inklee.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-auto w-full max-w-sm md:mx-0 md:max-w-md"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  What a tattoo waitlist actually does
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  A waitlist is more than
                  <br />a list of names.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  A tattoo waitlist is not just a list of people who sent DMs
                  while your books were closed. It should keep useful request
                  details visible so you can come back to serious clients when
                  the timing makes sense.
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  For tattoo artists, a waitlist works best when it stays
                  connected to the booking request: idea, placement, size,
                  references, contact details, city, travel dates, and status.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Problem (charcoal, stacked cards) */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                  Where informal waitlists break
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                  Saved DMs feel fine
                  <br />
                  until the next wave hits.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-shell-fg-dim md:text-lg">
                  Manual lists and screenshots work at low volume. Then future
                  demand gets messy fast.
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
                  const bg =
                    v === "mustard"
                      ? "bg-brand-mustard"
                      : v === "rosa"
                        ? "bg-brand-rosa"
                        : "bg-brand-bone";
                  return (
                    <div
                      key={p.title}
                      className={`flex flex-col gap-2 rounded-3xl p-6 md:p-7 ${bg}`}
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

        {/* Solution (mustard) */}
        <section className="bg-brand-mustard">
          <div className="container-marketing py-20 md:py-28">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                How Inklee handles waitlists
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                A waitlist built into
                <br />
                the booking flow.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Inklee keeps future demand connected to real request details, so
                artists can reopen books, plan guest spots, and follow up with
                more clarity.
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

        {/* Fields (bone, colored cards) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                What the waitlist captures
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Four details that make
                <br />a waitlist actually useful.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4 md:gap-6">
              {FIELDS_ITEMS.map((f, i) => {
                const variants = ["mustard", "bone-card", "rosa", "bone-card"];
                const v = variants[i];
                const bg =
                  v === "mustard"
                    ? "bg-brand-mustard"
                    : v === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-[#d9d4c7]";
                return (
                  <div
                    key={f.title}
                    className={`flex h-full flex-col gap-3 rounded-3xl p-6 ${bg}`}
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

        {/* Scenarios (charcoal) */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-2xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                When a waitlist helps
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                Four moments when a real
                <br />
                waitlist pays off.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-6">
              {SCENARIO_CARDS.map((a) => {
                const bg =
                  a.variant === "mustard"
                    ? "bg-brand-mustard"
                    : a.variant === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-brand-bone";
                return (
                  <div
                    key={a.title}
                    className={`flex h-full flex-col gap-3 rounded-3xl p-7 ${bg}`}
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

        {/* FAQ (bone) */}
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
                  Tattoo waitlists, answered.
                </h2>
              </div>
              <div className="rounded-3xl border-[1.5px] border-brand-charcoal/15 bg-[#d9d4c7] px-6 md:px-10">
                {WAITLIST_FAQ.map((item, idx) => {
                  const number = String(idx + 1).padStart(2, "0");
                  const isLast = idx === WAITLIST_FAQ.length - 1;
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

        {/* Related (charcoal) */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-20 md:py-28">
            <div className="mb-12 max-w-2xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                More to read
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl">
                Keep going.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              {RELATED_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex h-full flex-col justify-between gap-6 rounded-3xl border-[1.5px] border-shell-border p-6 transition-colors hover:border-shell-fg hover:bg-[#252525]"
                >
                  <div className="space-y-3">
                    <h3 className="text-xl font-black leading-tight text-shell-fg">
                      {link.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-shell-fg-dim">
                      {link.description}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-shell-fg-dim transition-colors group-hover:text-shell-fg">
                    Read more →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA (rosa) */}
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
                Stop losing future
                <br />
                bookings in DMs.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Collect structured requests, keep future demand visible, and
                move the right waitlist entries forward when books reopen.
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
