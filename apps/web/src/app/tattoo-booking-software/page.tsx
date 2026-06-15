import type { Metadata } from "next";
import Link from "next/link";
import SiteLogo from "@/components/site-logo";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { getRenderableFooterGroups } from "@/lib/footer-links";
import { PillNav } from "@/components/marketing-v2";

const PAGE_PATH = "/tattoo-booking-software";
const PAGE_TITLE = "Tattoo Booking Tool for Artists · Inklee";
const PAGE_DESCRIPTION =
  "Tattoo booking software without the generic business tool feel. Collect requests, references, approvals, deposits, and guest spots without DM chaos.";
const OG_TITLE = "Tattoo booking software made for tattoo artists";
const OG_DESCRIPTION =
  "Inklee helps solo and traveling artists turn Instagram chats into structured tattoo requests, approvals, and organized bookings.";

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

/* ─── SEO content (kept verbatim from the prior page for keyword weight) ── */

type Pain = { title: string; description: string };
type Solution = { title: string; description: string };
type Feature = { title: string; description: string };
type Audience = { title: string; description: string };
type Comparison = { feature: string; alt: string; inklee: string };
type Faq = { question: string; answer: string };
type Related = { title: string; description: string; href: string };

const PROBLEM_POINTS: Pain[] = [
  {
    title: "Requests arrive as scattered Instagram chats",
    description:
      "The first message rarely contains everything you need. Details show up across replies, voice notes, and reactions, never in one place.",
  },
  {
    title: "Reference images get separated from the actual idea",
    description:
      "Saved screenshots sit in one thread, the description in another, and you have to piece the request back together before you can answer.",
  },
  {
    title: "Clients skip size, placement, timing, or budget context",
    description:
      "Without a structured prompt, most clients send a vibe instead of a request. You end up asking the same questions every time.",
  },
  {
    title: "Guest spot messages mix with regular booking requests",
    description:
      "Berlin questions, your home studio inquiries, and old DMs from last year all sit in the same inbox.",
  },
  {
    title: "Generic schedulers push clients to pick a time too early",
    description:
      "Most appointment tools assume the service is fixed. Tattoo work is the opposite: the time slot is the last thing you decide, not the first.",
  },
];

const SOLUTION_POINTS: Solution[] = [
  {
    title: "One booking link for bio, stories, and replies",
    description:
      "Drop a single Inklee link wherever clients already find you. Serious requests land in a structured flow instead of another DM thread.",
  },
  {
    title: "Tattoo-specific request form before the appointment",
    description:
      "Collect idea, placement, size, references, and timing before anyone talks about availability.",
  },
  {
    title: "Approval flow before confirmation",
    description:
      "Review the request first. Approve what fits your work, decline what doesn't, and skip the calendar games until the idea is right.",
  },
  {
    title: "Guest spot and travel-friendly structure",
    description:
      "Organize requests around cities, travel dates, and booking windows so the right idea ends up in the right week.",
  },
  {
    title: "Deposit support where it fits your workflow",
    description:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
];

const CORE_FEATURES: Feature[] = [
  {
    title: "Tattoo request form",
    description:
      "Collect idea, placement, size, references, preferred timing, and contact details before replying.",
  },
  {
    title: "Booking link for Instagram",
    description:
      "Put one link in your bio, stories, or replies so serious requests land in a structured flow.",
  },
  {
    title: "Approval before confirmation",
    description:
      "Review the idea first. Not every request should instantly become an appointment.",
  },
  {
    title: "Guest spot support",
    description:
      "Organize requests around cities, travel dates, and booking windows instead of mixing everything in one inbox.",
  },
  {
    title: "Waitlist and future demand",
    description:
      "Keep demand visible when books are closed or when you are deciding where to travel next.",
  },
  {
    title: "Deposit-aware flow",
    description:
      "Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
];

const COMPARISON_ROWS: Comparison[] = [
  {
    feature: "Starting point",
    alt: "Usually starts with available times",
    inklee: "Starts with the tattoo request",
  },
  {
    feature: "Client details",
    alt: "Basic contact info and a short note",
    inklee: "Idea, placement, size, references, timing, and contact",
  },
  {
    feature: "Artist control",
    alt: "Client often books directly",
    inklee: "Artist reviews before confirming",
  },
  {
    feature: "Instagram workflow",
    alt: "Usually disconnected from chats and bio behavior",
    inklee: "Built around link-in-bio and Instagram-driven requests",
  },
  {
    feature: "Guest spots",
    alt: "Often needs workarounds",
    inklee: "Designed for travel dates, city demand, and booking windows",
  },
  {
    feature: "Deposits",
    alt: "Often handled separately or through generic payment settings",
    inklee: "Part of the booking flow, after the artist approves",
  },
  {
    feature: "Best fit",
    alt: "Calls, consultations, fixed services, studio-style scheduling",
    inklee: "Solo artists, traveling artists, and tattoo-specific intake",
  },
];

const AUDIENCE_CARDS: Array<
  Audience & { variant: "mustard" | "bone" | "rosa" }
> = [
  {
    title: "Solo tattoo artists",
    description:
      "For artists who handle their own inquiries and need cleaner request flow without hiring a front desk.",
    variant: "mustard",
  },
  {
    title: "Traveling guest spot artists",
    description:
      "For artists moving between cities, studios, and limited booking windows.",
    variant: "bone",
  },
  {
    title: "Artists working from Instagram",
    description:
      "For tattooers who still want Instagram as the front door, just not as the booking system.",
    variant: "rosa",
  },
  {
    title: "Not a heavy studio CRM",
    description:
      "Inklee is not trying to replace payroll, staff planning, accounting, or every admin tool a large studio might need.",
    variant: "bone",
  },
];

const SOFTWARE_FAQ: Faq[] = [
  {
    question: "What should a tattoo booking tool include?",
    answer:
      "A good tattoo booking tool should collect the idea, placement, size, reference images, preferred timing, contact details, and any information the artist needs before saying yes. The important part is not just scheduling. It is helping the artist decide if the request should become a booking.",
  },
  {
    question: "Why not just use a normal appointment scheduler?",
    answer:
      "Normal appointment schedulers are built for fixed services where the client can pick a time immediately. Tattoo requests usually need review first because the artist needs context, style fit, placement, size, and sometimes preparation before confirming anything.",
  },
  {
    question: "Do I need a booking tool if most clients come from Instagram?",
    answer:
      "That is exactly where a booking tool helps. Instagram can stay the place where people find you and start talking, but serious requests should move into a cleaner flow before details disappear in the chat.",
  },
  {
    question: "Is Inklee better for solo artists or studios?",
    answer:
      "Inklee is currently focused on solo tattoo artists, freelance artists, and traveling guest spot artists. Studios may find parts of it useful, but it is not built as a heavy studio CRM at this stage.",
  },
  {
    question: "Can Inklee help if I do guest spots?",
    answer:
      "Yes. Guest spot work creates extra chaos because requests are tied to cities, dates, studios, and limited booking windows. Inklee is designed to support that kind of travel-based request flow.",
  },
  {
    question: "Can I still talk to clients in DMs?",
    answer:
      "Yes. Inklee does not need to kill the conversation. It just gives you a cleaner place for the actual booking request, so the important details do not stay buried between reactions, voice notes, and casual chat.",
  },
  {
    question: "How should deposits fit into a tattoo booking flow?",
    answer:
      "Deposits should come after the request makes sense, not before the artist has enough context. Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
  {
    question: "Is this meant to replace my whole business setup?",
    answer:
      "No. Inklee is focused on tattoo intake and booking requests. It is not trying to replace every business tool, accounting setup, or studio management system.",
  },
];

const RELATED_LINKS: Related[] = [
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
      "See how Inklee moves serious tattoo requests out of messy Instagram chats.",
  },
  {
    title: "Guest spot booking for traveling artists",
    href: "/guest-spot-booking",
    description:
      "Organize city demand, travel dates, and guest spot requests without DM chaos.",
  },
];

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function TattooBookingSoftwarePage() {
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
      <JsonLd data={faqPageSchema(SOFTWARE_FAQ)} id="ld-faq" />
      <PillNav />
      <main className="flex-1">
        <HeroSection />
        <DefinitionSection />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <ComparisonSection />
        <AudienceSection />
        <FaqSection />
        <RelatedSection />
        <FinalCtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}

/* Nav is now the shared marketing-v2/PillNav (import above). Local copy
   removed so the FAB scroll-grow + mobile sizing stay in one place. */

/* ─── Hero (charcoal) ───────────────────────────────────────────────────── */

function HeroSection() {
  return (
    <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
      <div className="container-marketing-wide">
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
          <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
              Tattoo booking tool for artists
            </p>
            <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
              <span className="block">Tattoo booking software,</span>
              <span className="block text-brand-mustard">
                built for tattoo artists.
              </span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
              Inklee turns Instagram chats and inquiries into structured tattoo
              requests, so solo and traveling artists can review the idea before
              it becomes a booking.
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
          <div className="order-1 flex justify-center pt-5 md:order-2 md:-mr-8 md:justify-end md:pt-0 lg:-mr-16">
            <div className="animate-hero-float w-full max-w-sm md:max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/illustrations/mixed/inklee-_DM-to-Booking-Form.svg"
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
  );
}

/* ─── Definition (bone, scoped) ─────────────────────────────────────────── */

function DefinitionSection() {
  return (
    <section
      data-appearance="light"
      className="bg-brand-bone text-brand-charcoal"
    >
      <div className="container-marketing py-20 md:py-28">
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[6fr_6fr] md:gap-16">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/illustrations/mixed/inklee-_client-request-artist-review.svg"
              alt=""
              aria-hidden="true"
              className="mx-auto h-auto w-full max-w-lg md:mx-0"
              draggable={false}
            />
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
              Tattoo booking software, translated for real tattoo work
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
              A booking tool is only useful
              <br />
              if it understands the request.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
              For tattoo artists, booking is not just putting a name into a
              calendar. Before a client gets a spot, you usually need the idea,
              placement, size, references, timing, and enough context to decide
              if the piece fits your work.
            </p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
              That is where Inklee fits. It gives solo and traveling artists a
              booking link, tattoo request form, and approval flow built around
              the messy first step between &ldquo;I want a tattoo&rdquo; and
              &ldquo;yes, this should become an appointment.&rdquo;
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Problem (charcoal, stacked colored cards on right) ────────────────── */

function ProblemSection() {
  return (
    <section className="bg-shell-bg text-shell-fg">
      <div className="container-marketing py-24 md:py-32">
        <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
              Why generic tools miss
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
              Generic tools start with the slot.
              <br />
              Tattoo artists start with the idea.
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-shell-fg-dim md:text-lg">
              Most appointment tools assume the service is already clear.
              Tattooing does not work like that. A client might send half an
              idea, three screenshots, no placement, and ask for a price before
              you know if the piece even makes sense.
            </p>
          </div>
          <div className="space-y-4 md:space-y-5">
            {PROBLEM_POINTS.map((p, i) => {
              const variants = ["mustard", "bone", "rosa", "bone", "mustard"];
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
  );
}

/* ─── Solution (mustard) ────────────────────────────────────────────────── */

function SolutionSection() {
  return (
    <section className="bg-brand-mustard">
      <div className="container-marketing py-20 md:py-28">
        <div className="mb-12 max-w-3xl md:mb-16">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
            How Inklee fits
          </p>
          <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
            Helps you decide what
            <br />
            should actually get booked.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
            Inklee moves serious requests into a structured flow. Clients send
            the details first, then the artist reviews the request, approves
            what fits, and keeps the next steps organized.
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
  );
}

/* ─── Core features (bone, scoped) ──────────────────────────────────────── */

const FEATURE_VARIANTS = [
  "mustard",
  "bone-card",
  "rosa",
  "rosa",
  "mustard",
  "bone-card",
] as const;

function FeaturesSection() {
  return (
    <section
      data-appearance="light"
      className="bg-brand-bone text-brand-charcoal"
    >
      <div className="container-marketing py-24 md:py-32">
        <div className="mb-12 max-w-3xl md:mb-16">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
            What artists actually need
          </p>
          <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
            Six pieces of a tattoo
            <br />
            booking tool that works.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
            Tattoo bookings are not the same as haircuts, calls, or dentist
            appointments. The tool has to respect how artists decide what gets
            booked.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 md:gap-6">
          {CORE_FEATURES.map((f, i) => {
            const v = FEATURE_VARIANTS[i];
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
  );
}

/* ─── Comparison (charcoal table) ───────────────────────────────────────── */

function ComparisonSection() {
  return (
    <section className="bg-shell-bg text-shell-fg">
      <div className="container-marketing py-24 md:py-32">
        <div className="mb-12 max-w-3xl md:mb-16">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
            Side by side
          </p>
          <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
            Generic appointment tools
            <br />
            vs a tattoo-first booking tool.
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-shell-fg-dim">
            Generic tools are not useless. They work well when the service is
            fixed and the client can simply choose a time. Tattoo requests need
            more context before a time slot even matters.
          </p>
        </div>
        <div className="overflow-hidden rounded-3xl border-[1.5px] border-shell-border bg-[#252525]">
          <div className="grid grid-cols-1 gap-px bg-shell-border md:grid-cols-3">
            <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-shell-fg-dim">
              Feature
            </div>
            <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-shell-fg-dim">
              Generic appointment tools
            </div>
            <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-mustard">
              Inklee
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
          Inklee is not trying to become a heavy studio management system. It
          focuses on the first messy part: turning tattoo interest into
          organized booking requests.
        </p>
      </div>
    </section>
  );
}

/* ─── Audience (bone, scoped) ───────────────────────────────────────────── */

function AudienceSection() {
  return (
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
  );
}

/* ─── FAQ (charcoal, numbered card) ─────────────────────────────────────── */

function FaqSection() {
  return (
    <section className="bg-shell-bg text-shell-fg">
      <div className="container-marketing py-24 md:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12 text-center">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
              FAQ
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl">
              Tattoo booking software, answered.
            </h2>
          </div>
          <div className="rounded-3xl border-[1.5px] border-shell-border bg-[#252525] px-6 md:px-10">
            {SOFTWARE_FAQ.map((item, idx) => {
              const number = String(idx + 1).padStart(2, "0");
              const isLast = idx === SOFTWARE_FAQ.length - 1;
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
  );
}

/* ─── Related (bone, scoped) ────────────────────────────────────────────── */

function RelatedSection() {
  return (
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
            Go deeper into the
            <br />
            booking workflow.
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
  );
}

/* ─── Final CTA (rosa) ──────────────────────────────────────────────────── */

function FinalCtaSection() {
  return (
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
            Stop forcing tattoo requests
            <br />
            through generic tools.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
            Create a booking link that collects the right details before the
            booking starts.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
            >
              Create your booking link
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
  );
}

/* ─── Footer (shared) ───────────────────────────────────────────────────── */

function SiteFooter() {
  const groups = getRenderableFooterGroups();
  return (
    <footer className="border-t border-border">
      <div className="container-marketing py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <SiteLogo height={16} />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Booking tools for freelance and
              <br />
              traveling tattoo artists.
            </p>
          </div>
          {groups.map((group) => (
            <div key={group.id}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-3 space-y-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      {...(item.external && {
                        target: "_blank",
                        rel: "noopener noreferrer",
                      })}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Inklee. All rights reserved.</span>
          <span className="opacity-40">Made for the ink.</span>
        </div>
      </div>
    </footer>
  );
}
