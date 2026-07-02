import type { Metadata } from "next";
import Link from "next/link";
import TrackedCtaLink from "@/components/tracked-cta-link";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

const PAGE_PATH = "/guides/how-to-reduce-tattoo-no-shows";
const PAGE_TITLE = "How to reduce tattoo no-shows · Inklee";
const PAGE_DESCRIPTION =
  "A practical no-show system for tattoo artists: deposits, a written policy, confirmations, reminders, an easy cancel path, and a waitlist to refill slots.";
const OG_TITLE = "How to reduce tattoo no-shows";
const OG_DESCRIPTION =
  "Deposits, clear policy, reminders, reconfirmation, and a refill plan: the no-show system for tattoo artists, step by step.";

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
    title: "Take a deposit on every accepted booking",
    description:
      "A booking that costs nothing to abandon will be abandoned. A deposit, even a modest one, converts a casual yes into a commitment and compensates your preparation when someone still disappears. Ask for it after you accept the request, not before you have reviewed it.",
  },
  {
    title: "Write the reschedule and no-show policy down",
    description:
      "Decide how much notice moves a deposit to a new date and what happens on a silent no-show, then put those rules where clients book. A policy nobody saw before paying protects nobody.",
  },
  {
    title: "Confirm immediately after booking",
    description:
      "The moment a booking is fixed, the client should get a confirmation with the date, the place, and the policy. This is the message people scroll back to, so make it findable: email beats a chat thread.",
  },
  {
    title: "Remind a few days before the appointment",
    description:
      "Most honest no-shows are date confusion or plain forgetting, and a reminder a few days out catches both while there is still time to react. The day-of reminder alone is too late: if plans changed, the slot is already lost.",
  },
  {
    title: "Ask clients to reconfirm, and make cancelling easy",
    description:
      "Counterintuitive but true: an easy cancel path reduces no-shows. A client who can tap a link and cancel five days early gives you a slot to refill. A client who has to compose an awkward apology DM often just goes silent instead. Ask for a reconfirmation before longer-lead appointments and treat every early cancellation as a win.",
  },
  {
    title: "Keep a waitlist so freed slots get refilled",
    description:
      "The second half of the no-show problem is the empty chair. Keep a list of people who wanted a slot: cancellation-list clients, waitlist entries from when books were closed, or guest-spot demand in that city. An early cancellation plus a waitlist is just a schedule change.",
  },
  {
    title: "Review patterns and adjust",
    description:
      "If no-shows cluster around certain lead times, days, or booking sources, change something: a larger deposit for long-lead bookings, a reconfirmation step for appointments booked far ahead, or tighter policies for repeat offenders.",
  },
];

const CHECKLIST: string[] = [
  "Deposit required on every accepted booking",
  "Reschedule and no-show rules written and visible before payment",
  "Confirmation sent immediately when the booking is fixed",
  "Reminder goes out days before the appointment, not hours",
  "Reconfirmation with an easy, no-guilt cancel path",
  "Waitlist or cancellation list ready to refill freed slots",
  "No-show patterns reviewed now and then, policy adjusted",
];

const MISTAKES: Step[] = [
  {
    title: "Making cancellation hard",
    description:
      "If cancelling requires an awkward conversation, silent no-shows go up. The goal is early information, not punishment.",
  },
  {
    title: "Reminding only on the day",
    description:
      "A morning-of reminder confirms the no-show; it does not prevent it. Days-before is when a reminder can still save the slot.",
  },
  {
    title: "Explaining the policy after the no-show",
    description:
      "A policy introduced during the argument reads as improvised. It has to be visible before the deposit is paid.",
  },
  {
    title: "Expecting zero no-shows",
    description:
      "No deposit, reminder, or tool removes no-shows entirely. The realistic goal is fewer avoidable ones plus a refill plan for the rest.",
  },
  {
    title: "Fighting it out in public",
    description:
      "Calling clients out on stories feels fair and costs bookings. The policy and the deposit already handled it; let them.",
  },
];

const GUIDE_FAQ: Faq[] = [
  {
    question: "Do deposits stop tattoo no-shows?",
    answer:
      "They reduce them, clearly and reliably, because the booking is no longer free to abandon. They do not eliminate them, which is why reminders, reconfirmation, and a refill plan matter too.",
  },
  {
    question: "How many days before the appointment should I remind clients?",
    answer:
      "A few days out works well for most artists: close enough that the appointment is real, far enough that a cancellation still leaves time to refill the slot. Add a reconfirmation step for appointments booked far in advance.",
  },
  {
    question: "Should I really make cancelling easier?",
    answer:
      "Yes. You cannot prevent plans from changing; you can only choose whether you find out early by link or late by empty chair. An easy cancel path plus a deposit policy gives clients a graceful exit and gives you the slot back.",
  },
  {
    question: "What should I do when a client no-shows anyway?",
    answer:
      "Apply the policy you wrote: the deposit is handled as stated, and you decide about rebooking. Keep it factual and private, and put your energy into refilling the slot from your waitlist.",
  },
  {
    question: "Do email reminders work, or do I need texts?",
    answer:
      "A clear reminder that arrives days ahead does the job in any channel, because the mechanism is the same: it catches forgetting and surfaces changed plans early. Inklee sends reminder and reconfirmation emails automatically; SMS is not part of Inklee today.",
  },
];

export default function HowToReduceTattooNoShowsGuide() {
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
              Guide · No-shows
            </p>
            <h1 className="max-w-3xl text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
              How to reduce tattoo{" "}
              <span className="text-brand-mustard">no-shows.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              The short answer: make booking cost something (a deposit), write
              the rules down, confirm and remind by email days ahead, make
              cancelling easy so plans surface early, and keep a waitlist to
              refill the slots that free up. No single trick; a small system.
            </p>
          </div>
        </section>

        {/* Why no-shows happen */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-16 md:py-24">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                Why this happens
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight md:text-5xl">
                A no-show is rarely malice.
                <br />
                It is usually friction.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Most no-shows come from a handful of boring causes: the booking
                felt casual because it cost nothing, months passed between the
                yes and the chair, the date got confused, plans changed and
                telling you felt awkward, or the client simply forgot. Each of
                those has a specific counter, and none of the counters is
                shouting into the void.
              </p>
              <p className="mt-4 text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                For traveling artists the stakes are higher: a guest spot week
                has no next Tuesday, so every avoidable no-show and every
                unrefilled slot is gone for good.
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
                The seven-part
                <br />
                no-show system.
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
                  Your no-show system
                  <br />
                  is in place when:
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
                Five ways artists make
                <br />
                no-shows worse.
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
                  You can run this
                  <br />
                  from a calendar app.
                </h2>
                <p className="mt-5 text-base leading-relaxed text-brand-charcoal/80">
                  At a few bookings a month, a deposit link, a saved policy
                  text, and calendar alerts to send reminders yourself work
                  fine. The system matters more than the software.
                </p>
                <p className="mt-4 text-base leading-relaxed text-brand-charcoal/80">
                  The manual version breaks on volume and travel: reminders
                  depend on you remembering to remind, reconfirmations do not
                  happen at all, and the waitlist is a screenshot folder.
                </p>
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  How this works in Inklee
                </p>
                <h2 className="text-3xl font-black leading-tight tracking-tight text-brand-charcoal md:text-4xl">
                  The whole system,
                  <br />
                  already connected.
                </h2>
                <p className="mt-5 text-base leading-relaxed text-brand-charcoal/80">
                  In Inklee the pieces come wired together: deposits attach to
                  the requests you accept, confirmation and reminder emails go
                  out automatically on your schedule, reconfirmation emails
                  carry a secure cancel link so changed plans surface days
                  early, overdue deposits get followed up, and the waitlist
                  holds the people ready to take a freed slot.
                </p>
                <div className="mt-6">
                  <Link
                    href="/tattoo-appointment-reminders"
                    className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
                  >
                    See the reminder software →
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
                  Reducing no-shows, answered.
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
                Next step: put the system
                <br />
                on autopilot.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Deposits, reminders, reconfirmation, and the waitlist already
                work together in Inklee. You accept the requests; the follow-up
                runs itself.
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
                  href="/tattoo-appointment-reminders"
                  className="inline-flex items-center rounded-full border-[1.5px] border-brand-charcoal/30 px-6 py-3 text-base font-bold text-brand-charcoal transition-colors hover:border-brand-charcoal"
                >
                  Tattoo appointment reminders
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
