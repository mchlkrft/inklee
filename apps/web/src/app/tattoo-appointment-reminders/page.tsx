import type { Metadata } from "next";
import Link from "next/link";
import TrackedCtaLink from "@/components/tracked-cta-link";
import JsonLd from "@/components/seo/json-ld";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

const PAGE_PATH = "/tattoo-appointment-reminders";
const PAGE_TITLE = "Tattoo appointment reminder software · Inklee";
const PAGE_DESCRIPTION =
  "Tattoo appointment reminder software for artists. Automatic reminder emails, reconfirmation requests, and deposit follow-ups tied to accepted bookings.";
const OG_TITLE = "Tattoo appointment reminder software";
const OG_DESCRIPTION =
  "Reminder emails, reconfirmation requests, and deposit follow-ups that stay tied to the accepted booking, so fewer appointments get forgotten.";

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
    title: "Reminding clients by hand does not scale",
    description:
      "Scrolling back through DMs to remind every client before their session is exactly the kind of admin that gets skipped on busy weeks.",
  },
  {
    title: "Forgotten appointments cost real money",
    description:
      "A client who genuinely forgot is still an empty chair, lost preparation time, and a slot someone else wanted.",
  },
  {
    title: "Chasing deposits feels awkward",
    description:
      "Following up on an unpaid deposit by DM mixes money talk into a casual chat thread, and it is easy to forget who still owes what.",
  },
  {
    title: "You find out about cancellations too late",
    description:
      "Without a reconfirmation step, plans that changed weeks ago only surface on the day of the appointment.",
  },
  {
    title: "Travel makes timing harder",
    description:
      "Guest spots and short booking windows leave no room for a no-show. A reminder a few days ahead matters even more on the road.",
  },
];

const REMINDER_TYPES: Item[] = [
  {
    title: "Appointment reminders",
    description:
      "Clients get a reminder email a set number of days before the appointment, with the date, placement, and studio or location details.",
  },
  {
    title: "Reconfirmation requests",
    description:
      "Ahead of the appointment, clients can be asked to confirm they are still coming. The email carries a secure link, so a client whose plans changed can cancel early and you can offer the slot to someone else.",
  },
  {
    title: "Deposit follow-ups",
    description:
      "When a deposit is past its due date, the client gets a clear follow-up with the amount, the due date, and your payment note, and you get a copy, so nobody has to chase by DM.",
  },
  {
    title: "You control the schedule",
    description:
      "Each reminder type has its own on and off switch, and you choose how many days before the appointment reminders and reconfirmations go out.",
  },
  {
    title: "Tied to accepted bookings",
    description:
      "Reminders only ever go to bookings you approved. Nothing is sent for requests you passed on or have not reviewed yet.",
  },
];

const CONTEXT_ITEMS: Item[] = [
  {
    title: "The booking, not a generic blast",
    description:
      "Every reminder carries the context of the specific booking: date, placement, and the studio or city where the appointment happens.",
  },
  {
    title: "Deposit status included",
    description:
      "Deposit follow-ups state the amount, currency, due date, and your own payment note, so the client knows exactly what is open.",
  },
  {
    title: "Editable booking emails",
    description:
      "The booking-status emails (request received, accepted, passed, cancelled) are fully editable, subject and body, in your voice. Reminder emails you switch on and schedule.",
  },
  {
    title: "No client account needed",
    description:
      "Clients confirm or cancel through a secure link in the email. They never need to create an account or install anything.",
  },
];

const OUTCOME_ITEMS: Array<Item & { variant: "mustard" | "bone" | "rosa" }> = [
  {
    title: "Fewer forgotten appointments",
    description:
      "A reminder a few days ahead catches the honest forgetters. Reminders cannot guarantee attendance, but they remove the most avoidable no-shows.",
    variant: "mustard",
  },
  {
    title: "Cancellations surface earlier",
    description:
      "When a client cancels through the reconfirmation link, you hear about it days ahead instead of at the door, with time to fill the slot.",
    variant: "bone",
  },
  {
    title: "Deposit chasing stops being personal",
    description:
      "A neutral follow-up email does the awkward part. You only step in when something actually needs a conversation.",
    variant: "rosa",
  },
  {
    title: "One less thing to remember",
    description:
      "The reminders run nightly on their own. Your part is accepting the right requests and showing up to tattoo.",
    variant: "bone",
  },
];

const REMINDERS_FAQ: Faq[] = [
  {
    question: "Do appointment reminders stop no-shows?",
    answer:
      "They reduce the avoidable ones. Clients who genuinely forgot, mixed up dates, or needed a nudge to cancel early are exactly who reminders catch. No tool can guarantee every client shows up.",
  },
  {
    question: "When are the reminders sent?",
    answer:
      "You choose how many days before the appointment the reminder and the reconfirmation request go out. Inklee sends them automatically once a day.",
  },
  {
    question: "Can I turn individual reminder types on or off?",
    answer:
      "Yes. Appointment reminders, reconfirmation requests, and deposit follow-ups each have their own switch, so you only send what fits your workflow.",
  },
  {
    question: "Can clients confirm or cancel from the reminder?",
    answer:
      "The reconfirmation email contains a secure personal link. If the client's plans changed, they can cancel there, and you can offer the slot to someone on your waitlist.",
  },
  {
    question: "Are SMS text reminders supported?",
    answer:
      "No. Inklee reminders are email only today. Every reminder goes to the email address the client used on their booking request.",
  },
  {
    question: "Can I edit what the emails say?",
    answer:
      "The booking-status emails (request received, accepted, passed, cancelled by you) are fully editable in your own words. The three reminder types are not free-text: you control whether they send and how many days ahead.",
  },
  {
    question: "Do reminders work together with deposits?",
    answer:
      "Yes. If a deposit is past due, the client gets a follow-up with the amount and your payment note, and you get a copy, so deposit chasing does not depend on you remembering.",
  },
  {
    question: "Do my clients need an Inklee account?",
    answer:
      "No. Clients only receive emails and use secure links. Accounts are for artists.",
  },
];

const RELATED_LINKS: Related[] = [
  {
    title: "Tattoo Booking Software",
    href: "/tattoo-booking-software",
    description:
      "See the full booking flow: structured requests, artist review, deposits, waitlist, and guest spots in one system.",
  },
  {
    title: "Tattoo Deposit Tool",
    href: "/tattoo-deposit-tool",
    description:
      "Deposits as part of the booking flow, with paid, pending, and overdue status connected to each request.",
  },
  {
    title: "Tattoo Artist Waitlist",
    href: "/tattoo-artist-waitlist",
    description:
      "When a reconfirmation surfaces a cancellation early, a waitlist gives you someone to offer the slot to.",
  },
  {
    title: "Tattoo Client Management",
    href: "/tattoo-client-management",
    description:
      "Reminders already know the client. See the record they belong to: contact info, history, and notes.",
  },
  {
    title: "Guide: how to reduce tattoo no-shows",
    href: "/guides/how-to-reduce-tattoo-no-shows",
    description:
      "The full no-show system: deposits, policy, reminders, an easy cancel path, and a refill plan.",
  },
];

export default function TattooAppointmentRemindersPage() {
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
      <JsonLd data={faqPageSchema(REMINDERS_FAQ)} id="ld-faq" />
      <PillNav />
      <main className="flex-1">
        <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
          <div className="container-marketing-wide">
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
              <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                  Tattoo appointment reminder software
                </p>
                <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  <span className="block">Appointment reminders,</span>
                  <span className="block text-brand-mustard">
                    tied to real bookings.
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                  Automatic reminder emails, reconfirmation requests, and
                  deposit follow-ups for the bookings you accepted. Fewer
                  forgotten appointments, without another app to check.
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
                    href="/tattoo-booking-software"
                    className="inline-flex items-center rounded-full border-[1.5px] border-shell-border px-6 py-3 text-base font-bold text-shell-fg-dim transition-colors hover:border-shell-fg hover:text-foreground"
                  >
                    See the full booking flow →
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
                    src="/branding/illustrations/feature-calendar.svg"
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
                  src="/branding/illustrations/mixed/inklee-_Client-Question-Conversation.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-auto w-full max-w-lg md:mx-0"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  Reminders, connected to the booking
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  A reminder is only useful
                  <br />
                  if it knows the booking.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Generic reminder software does not know what you approved,
                  what deposit is open, or which city the appointment is in.
                  Inklee sends reminders from the booking itself, so the date,
                  placement, deposit, and location context is already there.
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Built for custom tattoo work: request first, artist approval
                  second, appointment and reminders after that.
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
                  Why manual reminding fails
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                  You should not be
                  <br />
                  your own reminder app.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-shell-fg-dim md:text-lg">
                  Reminding clients by DM works until the week gets busy, and
                  the busy weeks are exactly when no-shows hurt most.
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
                How Inklee reminders work
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                Accept the booking.
                <br />
                The reminders take over.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Three reminder types run automatically for accepted bookings.
                Each one can be switched on or off, and you decide how many days
                ahead they go out.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {REMINDER_TYPES.map((s, i) => (
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
                Tattoo context included
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                What every reminder
                <br />
                already knows.
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
                Fewer no-shows.
                <br />
                No promises, just fewer.
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
                  Tattoo appointment reminders, answered.
                </h2>
              </div>
              <div className="rounded-3xl border-[1.5px] border-brand-charcoal/15 bg-[#d9d4c7] px-6 md:px-10">
                {REMINDERS_FAQ.map((item, idx) => {
                  const number = String(idx + 1).padStart(2, "0");
                  const isLast = idx === REMINDERS_FAQ.length - 1;
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
                Stop being your own
                <br />
                reminder system.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Accept the right requests. Let the reminders handle the
                follow-up.
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
