import type { Metadata } from "next";
import Link from "next/link";
import TrackedCtaLink from "@/components/tracked-cta-link";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

const PAGE_PATH = "/guides/how-to-take-tattoo-deposits-online";
const PAGE_TITLE = "How to take tattoo deposits online · Inklee";
const PAGE_DESCRIPTION =
  "A practical guide for tattoo artists: decide the deposit, write the policy, pick a payment method, tie it to approval, and keep clean records.";
const OG_TITLE = "How to take tattoo deposits online";
const OG_DESCRIPTION =
  "Deposit amount, policy, payment methods, timing, and record keeping for tattoo artists, step by step.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: absoluteUrl(PAGE_PATH),
    type: "article",
  },
  twitter: {
    card: "summary",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
};

type Step = { title: string; description: string };
type Faq = { question: string; answer: string };

const STEPS: Step[] = [
  {
    title: "Decide what the deposit is and what it covers",
    description:
      "Pick a fixed amount or a rough share of the expected price, and decide what it reserves: your drawing time, the appointment slot, or both. Most artists deduct it from the final price. There is no universal number; it depends on your project sizes, your region, and how much preparation a piece needs.",
  },
  {
    title: "Write the policy down before you ever ask for money",
    description:
      "Three sentences beat a perfect legal document that only exists in your head: what the deposit reserves, what happens if the client reschedules (and with how much notice), and what happens on a no-show. Keep local consumer rules in mind, especially around refunds, and keep the policy visible wherever clients book.",
  },
  {
    title: "Review the request before asking for the deposit",
    description:
      "For custom work, look at the idea, placement, size, and references first, and only ask for a deposit once you have actually said yes. Asking before you review wastes the client's money and your refund admin when the project does not fit.",
  },
  {
    title: "Pick how you collect the money",
    description:
      "Anything with a record works: a payment link (Stripe, PayPal, or similar), a bank transfer with a reference, or a card payment inside your booking tool. Avoid methods that leave no trail. Cash deposits work in person, but online requests deserve an online method the client can complete in one step.",
  },
  {
    title: "Send one clear payment message",
    description:
      "When you accept the request, send the amount, the deadline, the payment method, and the policy in a single message or email. The client should never have to scroll a chat thread to find out how much and by when.",
  },
  {
    title: "Track paid, pending, and overdue",
    description:
      "Keep a simple list per booking: requested date, amount, due date, paid or not. Whether that is a spreadsheet or your booking tool, the point is that you never have to reconstruct payment status from a DM thread.",
  },
  {
    title: "Apply the policy calmly when plans change",
    description:
      "Reschedules and cancellations are normal. Because the policy was written and shared before money moved, you can point to it instead of negotiating from scratch, and decide the exceptions yourself.",
  },
];

const CHECKLIST: string[] = [
  "Deposit amount or formula decided",
  "Policy written: what it reserves, reschedule rules, no-show rules",
  "Policy visible where clients book, not only in your head",
  "Deposit requested only after you accept the request",
  "Payment method with a record (link, transfer with reference, or in-app card)",
  "One message with amount, deadline, method, and policy",
  "Paid and pending status tracked per booking",
  "Refund and reschedule handling decided before it is needed",
];

const MISTAKES: Step[] = [
  {
    title: "Asking for money before reviewing the request",
    description:
      "If the project does not fit your style or schedule, you now owe a refund and an awkward message. Accept first, then ask.",
  },
  {
    title: "A policy that only exists in your head",
    description:
      "Unwritten rules turn every reschedule into a negotiation. Write it once, show it everywhere, apply it calmly.",
  },
  {
    title: "Payment links buried in chat",
    description:
      "A deposit link sent mid-conversation disappears under new messages. Send it as its own clear message with the deadline attached.",
  },
  {
    title: "No record of who paid what",
    description:
      "Memory is not bookkeeping. Every deposit should be findable later: amount, date, booking, method.",
  },
  {
    title: "Treating the deposit like a guarantee",
    description:
      "A deposit filters out casual bookings and compensates preparation. It cannot force anyone to show up, and promising yourself otherwise leads to bad policies.",
  },
];

const GUIDE_FAQ: Faq[] = [
  {
    question: "When should I ask for the tattoo deposit?",
    answer:
      "After you have reviewed and accepted the request, and before you invest serious drawing time or lock the date. Accept first, then ask: it keeps refund admin near zero.",
  },
  {
    question: "What payment methods work for tattoo deposits online?",
    answer:
      "Payment links (Stripe, PayPal, or similar), bank transfers with a clear reference, or card payment built into a booking tool. The common rule: the method must leave a record you can find later.",
  },
  {
    question: "What should a tattoo deposit policy include?",
    answer:
      "Three things: what the deposit reserves, the reschedule rules (how much notice moves the deposit to a new date), and the no-show rules. Keep local consumer law in mind, especially around refunds.",
  },
  {
    question: "Do I need booking software to take deposits online?",
    answer:
      "No. A payment link plus a written policy plus a tracking list works at low volume. Software becomes worth it when you are chasing several open deposits at once, or when travel and guest spots multiply the moving parts.",
  },
  {
    question: "Should the deposit be refundable?",
    answer:
      "That depends on your policy, the timing, and local rules. What matters most is that the client knew the answer before paying. Vague rules cause disputes; clear ones prevent them.",
  },
];

export default function HowToTakeTattooDepositsOnlineGuide() {
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
      <JsonLd data={faqPageSchema(GUIDE_FAQ)} id="ld-faq" />
      <PillNav />
      <main className="flex-1">
        {/* Hero */}
        <section className="overflow-hidden">
          <div className="container-marketing py-16 md:py-24">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
              Guide · Deposits
            </p>
            <h1 className="max-w-3xl text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
              How to take tattoo deposits{" "}
              <span className="text-brand-mustard">online.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              The short answer: decide what the deposit covers, write the policy
              down, accept the request first, collect through a method that
              leaves a record, and track paid versus pending per booking. This
              guide walks through each step, whether you use booking software or
              a notebook.
            </p>
          </div>
        </section>

        {/* Why deposits go wrong */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-16 md:py-24">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                Why this goes wrong
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight md:text-5xl">
                The problem is rarely the money.
                <br />
                It is the missing structure.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Most deposit pain comes from ordering and ambiguity, not from
                clients being difficult. Money is requested before the project
                is even reviewed. The policy lives in the artist&apos;s head.
                The payment link sinks into a chat thread. Paid and unpaid live
                in memory. Each of those is fixable with a decision, not a
                product.
              </p>
              <p className="mt-4 text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Getting attention is only half the problem. The booking process
                has to turn that attention into complete, manageable tattoo
                requests, and the deposit step is where a request becomes a
                commitment.
              </p>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-16 md:py-24">
            <div className="mb-12 max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Step by step
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl">
                Seven steps to deposits
                <br />
                that run themselves.
              </h2>
            </div>
            <div className="space-y-4 md:space-y-5">
              {STEPS.map((s, i) => {
                const variants = ["mustard", "bone", "rosa"];
                const v = variants[i % variants.length];
                const bgClass =
                  v === "mustard"
                    ? "bg-brand-mustard"
                    : v === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-brand-bone";
                return (
                  <div
                    key={s.title}
                    className={`flex flex-col gap-2 rounded-3xl p-6 md:flex-row md:items-start md:gap-6 md:p-7 ${bgClass}`}
                  >
                    <span className="text-3xl font-black leading-none text-brand-charcoal/70 md:w-16 md:shrink-0 md:text-4xl">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                        {s.title}
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-charcoal/75 md:text-base">
                        {s.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Checklist */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-16 md:py-24">
            <div className="grid grid-cols-1 gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  Checklist
                </p>
                <h2 className="text-3xl font-black leading-tight tracking-tight md:text-5xl">
                  Your deposit setup
                  <br />
                  is done when:
                </h2>
              </div>
              <ul className="space-y-3">
                {CHECKLIST.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 rounded-2xl bg-[#d9d4c7] px-5 py-4"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 text-base font-black text-brand-charcoal"
                    >
                      ✓
                    </span>
                    <span className="text-sm leading-relaxed text-brand-charcoal/85 md:text-base">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Common mistakes */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-16 md:py-24">
            <div className="mb-12 max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Common mistakes
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl">
                Five ways deposits
                <br />
                create their own chaos.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
              {MISTAKES.map((m, i) => {
                const variants = ["rosa", "bone", "mustard", "bone", "rosa"];
                const v = variants[i % variants.length];
                const bgClass =
                  v === "mustard"
                    ? "bg-brand-mustard"
                    : v === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-brand-bone";
                return (
                  <div
                    key={m.title}
                    className={`flex h-full flex-col gap-3 rounded-3xl p-6 ${bgClass}`}
                  >
                    <h3 className="text-lg font-black leading-tight text-brand-charcoal">
                      {m.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-brand-charcoal/75">
                      {m.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Manual vs software + Inklee workflow */}
        <section className="bg-brand-mustard">
          <div className="container-marketing py-16 md:py-24">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  When manual is enough
                </p>
                <h2 className="text-3xl font-black leading-tight tracking-tight text-brand-charcoal md:text-4xl">
                  A notebook works,
                  <br />
                  until it does not.
                </h2>
                <p className="mt-5 text-base leading-relaxed text-brand-charcoal/80">
                  A payment link, a written policy, and a tracking list cover a
                  handful of bookings a month in one city perfectly well. Do
                  that before you buy anything.
                </p>
                <p className="mt-4 text-base leading-relaxed text-brand-charcoal/80">
                  The manual setup starts leaking when volume grows, when you
                  travel, or when several deposits are open at once: links get
                  buried, statuses drift, and follow-ups depend on memory.
                </p>
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  How this works in Inklee
                </p>
                <h2 className="text-3xl font-black leading-tight tracking-tight text-brand-charcoal md:text-4xl">
                  Deposits attached
                  <br />
                  to the booking itself.
                </h2>
                <p className="mt-5 text-base leading-relaxed text-brand-charcoal/80">
                  In Inklee the deposit is a step on the request you accepted:
                  you set the amount, note, and due date, and the paid, pending,
                  or overdue status lives on the booking. Clients can pay by
                  card into your own Stripe account (Inklee keeps a 3% fee that
                  covers card processing), or you track a deposit you collect
                  your own way for free. Overdue deposits get an automatic
                  follow-up email.
                </p>
                <div className="mt-6">
                  <Link
                    href="/tattoo-deposit-tool"
                    className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
                  >
                    See the deposit software →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-16 md:py-24">
            <div className="mx-auto max-w-3xl">
              <div className="mb-12 text-center">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  FAQ
                </p>
                <h2 className="text-3xl font-black leading-tight tracking-tight md:text-5xl">
                  Taking deposits online, answered.
                </h2>
              </div>
              <div className="rounded-3xl border-[1.5px] border-brand-charcoal/15 bg-[#d9d4c7] px-6 md:px-10">
                {GUIDE_FAQ.map((item, idx) => {
                  const number = String(idx + 1).padStart(2, "0");
                  const isLast = idx === GUIDE_FAQ.length - 1;
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

        {/* Next step */}
        <section className="bg-brand-rosa">
          <div className="container-marketing py-16 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl">
                Next step: make the deposit
                <br />
                part of the booking.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Inklee ties the whole flow together: the request, your accept or
                pass decision, the deposit, and the reminder emails around the
                appointment.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <TrackedCtaLink
                  cta="final-signup"
                  href="/signup"
                  className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
                >
                  Create your booking link
                </TrackedCtaLink>
                <Link
                  href="/tattoo-deposit-tool"
                  className="inline-flex items-center rounded-full border-[1.5px] border-brand-charcoal/30 px-6 py-3 text-base font-bold text-brand-charcoal transition-colors hover:border-brand-charcoal"
                >
                  Tattoo deposit software
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
