import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

const PAGE_PATH = "/tattoo-deposit-tool";
const PAGE_TITLE = "Tattoo Deposit Tool for Artists | Inklee";
const PAGE_DESCRIPTION =
  "Inklee helps tattoo artists make deposits part of the booking flow with structured requests, approval states, and clearer client handling.";
const OG_TITLE = "Tattoo Deposit Tool for Artists";
const OG_DESCRIPTION =
  "A tattoo-deposit-aware booking flow for artists who want less payment chaos and clearer request handling.";

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
type Related = {
  title: string;
  description: string;
  href: string;
  external?: boolean;
};

const PROBLEM_POINTS: Item[] = [
  {
    title: "Payment links get buried in DMs",
    description:
      "When deposit links are sent through chat, the payment context can disappear under new messages and follow-ups.",
  },
  {
    title: "Artists track paid and unpaid manually",
    description:
      "Separate notes or spreadsheets make it easy to lose track of who has paid, who is pending, and who needs a reminder.",
  },
  {
    title: "Clients think the booking is confirmed too early",
    description:
      "If request approval and deposit status are not connected, clients can misunderstand where they are in the process.",
  },
  {
    title: "Policies are explained too late",
    description:
      "Deposit rules, rescheduling expectations, and cancellation notes should be clear before the booking becomes awkward.",
  },
  {
    title: "Guest spots add another layer",
    description:
      "When city, travel dates, and limited booking windows are involved, manual deposit tracking gets even harder to manage.",
  },
];

const SOLUTION_POINTS: Item[] = [
  {
    title: "Deposit after artist approval",
    description:
      "The artist can review the tattoo request first, then move the booking into a deposit-related step when it makes sense.",
  },
  {
    title: "Status tied to the booking",
    description:
      "Deposit pending, deposit received, and confirmed booking states are easier to understand when they stay connected to the request.",
  },
  {
    title: "Less separate spreadsheet work",
    description:
      "Artists can avoid rebuilding a paid-vs-unpaid tracker by hand for every approved request.",
  },
  {
    title: "Cleaner client communication",
    description:
      "Clients get a clearer sense of what has been requested, what is pending, and what happens next.",
  },
  {
    title: "Better fit for guest spots",
    description:
      "Deposit status becomes easier to manage when requests are already organized around cities, dates, and booking windows.",
  },
];

const POLICY_ITEMS: Item[] = [
  {
    title: "Deposit amount",
    description:
      "State how the deposit amount is calculated or chosen, without turning it into a hidden surprise.",
  },
  {
    title: "What the deposit reserves",
    description:
      "Explain whether the deposit reserves time, design preparation, appointment planning, or another part of the process.",
  },
  {
    title: "Rescheduling rules",
    description:
      "Set clear expectations for what happens if the client needs to move the appointment.",
  },
  {
    title: "No-show rules",
    description:
      "Explain how missed appointments are handled, while keeping local laws and studio policy in mind.",
  },
];

const OUTCOME_ITEMS: Array<Item & { variant: "mustard" | "bone" | "rosa" }> = [
  {
    title: "Fewer ghosted bookings",
    description:
      "A deposit step can make the booking feel more real, even though it cannot guarantee every client will show up.",
    variant: "mustard",
  },
  {
    title: "Less payment back and forth",
    description:
      "The deposit conversation is easier when it is part of the booking flow instead of another scattered DM thread.",
    variant: "bone",
  },
  {
    title: "Cleaner cancellation talks",
    description:
      "Clear deposit status and policy notes make hard conversations less messy when plans change.",
    variant: "rosa",
  },
  {
    title: "Fewer awkward refund DMs",
    description:
      "When expectations are written down early, artists have a clearer starting point for refund and rescheduling questions.",
    variant: "bone",
  },
];

const DEPOSIT_FAQ: Faq[] = [
  {
    question: "Should tattoo artists take deposits?",
    answer:
      "Many tattoo artists use deposits to protect time, preparation, and booking commitment. Whether and how you use deposits depends on your workflow, studio policy, and local rules.",
  },
  {
    question: "How much should a tattoo deposit be?",
    answer:
      "There is no universal deposit amount that fits every artist or region. Deposit amounts often depend on project size, appointment length, artist policy, and local expectations.",
  },
  {
    question: "What does a tattoo deposit cover?",
    answer:
      "A deposit can be used to reserve time, support preparation, or confirm commitment, depending on the artist's policy. Artists should explain this clearly before the client pays.",
  },
  {
    question: "Are tattoo deposits refundable?",
    answer:
      "Refundability depends on local law, studio policy, timing, and the specific situation. Artists should avoid vague rules and make their deposit policy clear before payment.",
  },
  {
    question: "What happens to a deposit if the client no-shows?",
    answer:
      "That depends on the artist's policy and local rules. The important part is to explain no-show expectations before the booking is confirmed, not after the problem happens.",
  },
  {
    question: "Can deposits prevent no-shows?",
    answer:
      "Deposits can reduce casual bookings and make clients more committed, but they cannot guarantee that every client will show up.",
  },
  {
    question: "Should the deposit be paid before or after approval?",
    answer:
      "For custom tattoo work, it usually makes sense to review the tattoo request first. Inklee is built around artist approval before moving a request forward in the booking flow.",
  },
  {
    question: "Do I need a separate payment tool for deposits?",
    answer:
      "Some artists use separate payment links or invoices, but that can create extra tracking work. Inklee is built to make deposits part of the booking flow. Availability depends on your current setup and enabled features.",
  },
];

const RELATED_LINKS: Related[] = [
  {
    title: "Tattoo Booking Software",
    href: "/tattoo-booking-software",
    description:
      "See how Inklee helps tattoo artists manage requests, approvals, deposits, waitlists, and guest spots.",
  },
  {
    title: "Tattoo Booking Form",
    href: "/tattoo-booking-form",
    description:
      "Learn what details a tattoo request form should collect before an artist says yes.",
  },
  {
    title: "Tattoo Deposit Policy Template",
    href: "https://github.com/mchlkrft/tattoo-booking-form-template/blob/main/docs/tattoo-deposit-policy-template.md",
    description:
      "A longer public template artists can adapt when writing their own deposit policy.",
    external: true,
  },
];

export default function TattooDepositToolPage() {
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
      <JsonLd data={faqPageSchema(DEPOSIT_FAQ)} id="ld-faq" />
      <PillNav />
      <main className="flex-1">
        <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
          <div className="container-marketing-wide">
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
              <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                  Tattoo deposit tool for artists
                </p>
                <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  <span className="block">A deposit-aware</span>
                  <span className="block text-brand-mustard">
                    tattoo booking flow.
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                  Inklee makes deposits part of the booking flow, so paid,
                  pending, and confirmed bookings stay connected instead of
                  scattered across DMs and spreadsheets.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
                  <Link
                    href="/signup"
                    className="inline-flex items-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
                  >
                    Create your booking link
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
              <div className="order-1 flex justify-center pt-5 md:order-2 md:justify-end md:pt-0">
                <div className="animate-hero-float w-full max-w-xs md:max-w-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/branding/illustrations/mixed/inklee-_artist-confirmed.svg"
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
                  src="/branding/illustrations/mixed/inklee-_client-idea-drawing.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-auto w-full max-w-lg md:mx-0"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  Deposits, connected to the booking
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  Deposits should be part of
                  <br />
                  the booking flow, not next to it.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  When deposits are handled in a separate payment app, the
                  payment status often disconnects from the actual tattoo
                  request. Inklee is built to keep deposits, approval states,
                  and the booking record in one place.
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Availability depends on your current setup and enabled
                  features.
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
                  Why manual deposits break
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                  Separate payment links.
                  <br />
                  Scattered booking state.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-shell-fg-dim md:text-lg">
                  When deposit tracking lives outside the booking flow, paid vs
                  unpaid status falls back to memory, spreadsheets, and DMs.
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
                How Inklee handles deposits
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                Approval first.
                <br />
                Deposit next.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                The artist reviews the tattoo request before moving the booking
                forward. Deposit comes after approval, not before anyone knows
                if the piece even fits.
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
                Deposit policy basics
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                What every tattoo deposit
                <br />
                policy should explain.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                The deposit conversation gets easier when these basics are
                explained clearly before any money changes hands.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-6">
              {POLICY_ITEMS.map((item, i) => {
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
                Deposits done right.
                <br />
                Fewer awkward DMs.
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
                  Tattoo deposits, answered.
                </h2>
              </div>
              <div className="rounded-3xl border-[1.5px] border-brand-charcoal/15 bg-[#d9d4c7] px-6 md:px-10">
                {DEPOSIT_FAQ.map((item, idx) => {
                  const number = String(idx + 1).padStart(2, "0");
                  const isLast = idx === DEPOSIT_FAQ.length - 1;
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
              {RELATED_LINKS.map((link) => {
                const cardClass =
                  "group flex h-full flex-col justify-between gap-6 rounded-3xl border-[1.5px] border-brand-charcoal/15 p-6 transition-colors hover:border-brand-charcoal/40 hover:bg-[#d9d4c7]";
                const inner = (
                  <>
                    <div className="space-y-3">
                      <h3 className="text-xl font-black leading-tight text-brand-charcoal">
                        {link.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-brand-charcoal/75">
                        {link.description}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-brand-charcoal/70 transition-colors group-hover:text-brand-charcoal">
                      {link.external ? "Open →" : "Read more →"}
                    </span>
                  </>
                );
                if (link.external) {
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cardClass}
                    >
                      {inner}
                    </a>
                  );
                }
                return (
                  <Link key={link.href} href={link.href} className={cardClass}>
                    {inner}
                  </Link>
                );
              })}
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
                Stop tracking deposits
                <br />
                across three apps.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Put deposits where the booking already lives.
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
