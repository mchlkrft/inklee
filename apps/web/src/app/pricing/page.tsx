import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/json-ld";
import TrackedCtaLink from "@/components/tracked-cta-link";
import { PillNav, SiteFooter } from "@/components/marketing-v2";
import { faqPageSchema, webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PLUS_CONSUMER_LAUNCH_ENABLED } from "@/lib/plus-launch-config";

// Public pricing page. SEO posture (fail-closed per docs/seo/inklee-seo-strategy.md):
// noindex + follow, self-referencing canonical, NOT in marketing-routes/sitemap.
// Pricing intent has no owner URL in the canonical strategy; indexation is filed
// as a proposal in the strategy's Proposed-changes section and stays with ChatGPT.
// The page itself is gated on the consumer launch flag so it cannot show paid
// plans before Plus is purchasable (it 404s while the flag is off).
//
// Copy sources (approved wording only): the founder's own pricing-page draft
// (docs/business-model.md section 7), the shipped PLUS_BENEFITS strings
// (settings/plan), the counsel-shown pricing table
// (docs/legal/consumer-launch-signoff-package.md), and the founder-ratified
// display decision "3.00 EUR per month, final price" (2026-07-25).

const PAGE_PATH = "/pricing";
const PAGE_TITLE = "Pricing · Inklee";
const PAGE_DESCRIPTION =
  "Inklee pricing: a genuinely useful free plan for solo tattoo artists, and Inklee Plus for 3 EUR a month. Final prices, cancel any time.";
const OG_TITLE = "Inklee pricing";
const OG_DESCRIPTION =
  "Three options. The free one is genuinely useful. Inklee Plus is 3 EUR a month, final price, cancel any time.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  // Fail-closed: pricing intent has no owner in the canonical SEO strategy yet.
  // Indexation is proposed, not assumed (strategy Proposed-changes section).
  robots: { index: false, follow: true },
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: absoluteUrl(PAGE_PATH),
    type: "website",
  },
  twitter: { card: "summary", title: OG_TITLE, description: OG_DESCRIPTION },
};

type Faq = { question: string; answer: string };

const PRICING_FAQ: Faq[] = [
  {
    question: "Is the free plan actually usable?",
    answer:
      "Yes. Free includes the complete booking workflow: your public page, the request form, review and scheduling, manual deposit tracking, waitlist, trip planner, flash, and the client portal. It is the product, not a trial.",
  },
  {
    question: "What does Inklee Plus cost?",
    answer:
      "3.00 EUR per month, final price. Inklee is not VAT registered, so no VAT is added: the price you see is the price you pay. The subscription renews monthly until you cancel. A yearly option is planned.",
  },
  {
    question: "Can I cancel any time?",
    answer:
      "Yes. You cancel in the app from your plan settings, as easily as you subscribed. You keep Plus until the end of the paid period, and your account and all of your data are kept.",
  },
  {
    question: "Can I change my mind after buying?",
    answer:
      "If you buy Plus as a consumer in the EU you have a 14-day right of withdrawal, which is separate from cancelling. It works directly from your plan settings. No reason needed, no support ticket.",
  },
  {
    question: "What does collecting deposits cost?",
    answer:
      "Card deposits collected through Inklee carry a flat 3% fee with card processing included. Your client always pays exactly the deposit amount. Manual deposit tracking stays free.",
  },
  {
    question: "When is the Studio plan coming?",
    answer:
      "Later. Solo artists come first. If you run a studio and want in early, write to hello@inklee.app.",
  },
];

const FREE_FEATURES = [
  "One public booking page with your link",
  "A structured tattoo request form",
  "Request review: accept, pass, or suggest a date",
  "Manual deposit tracking and waitlist",
  "Trip planner for guest spots",
  "Flash gallery with Instagram import",
  "Email notifications and a client portal",
];

const PLUS_FEATURES = [
  "Collect card deposits in-app (flat 3% fee, card processing included)",
  "Remove the “made with Inklee” footer from your public pages",
  "Customise your booking email templates",
  "Up to 30 custom form fields, 100 guest-spot trips, and 50 studios",
  "Advanced booking analytics",
];

export default function PricingPage() {
  // Dark until the consumer launch flips: paid plans must not be shown publicly
  // before Plus is purchasable (counsel: price display reflects what is buyable).
  if (!PLUS_CONSUMER_LAUNCH_ENABLED) notFound();

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
      <JsonLd data={faqPageSchema(PRICING_FAQ)} id="ld-faq" />
      <PillNav />
      <main className="flex-1">
        <HeroSection />
        <PlansSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ────────────────────────── sections ────────────────────────── */

function HeroSection() {
  return (
    <section className="bg-shell-bg text-shell-fg">
      <div className="container-marketing pb-16 pt-36 text-center md:pb-20 md:pt-44">
        <h1 className="text-5xl font-black leading-none tracking-tight md:text-7xl">
          Pricing
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-shell-fg-dim md:text-xl">
          Three options. The free one is genuinely useful.
        </p>
      </div>
    </section>
  );
}

function Check({ dark = false }: { dark?: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 shrink-0 text-sm font-black ${dark ? "text-brand-mustard" : "text-brand-charcoal"}`}
    >
      &#10003;
    </span>
  );
}

function PlansSection() {
  return (
    <section
      data-appearance="light"
      className="bg-brand-bone text-brand-charcoal"
    >
      <div className="container-marketing py-20 md:py-28">
        <div className="grid gap-6 md:grid-cols-3 md:items-start">
          {/* Free Starter */}
          <div className="flex h-full flex-col gap-5 rounded-3xl bg-[#d9d4c7] p-7">
            <div>
              <h2 className="text-xl font-black">Free Starter</h2>
              <p className="mt-1 text-sm text-brand-charcoal/70">
                Use Inklee like you use Instagram. Free for solo tattoo artists.
              </p>
            </div>
            <p className="flex items-baseline gap-1">
              <span className="text-5xl font-black tracking-tight">
                &euro;0
              </span>
            </p>
            <p className="text-xs text-brand-charcoal/70">
              No card needed. Free is the product, not a trial.
            </p>
            <TrackedCtaLink
              cta="pricing-free-signup"
              href="/signup"
              className="inline-flex items-center justify-center rounded-full border-[1.5px] border-brand-charcoal px-6 py-3 text-base font-bold text-brand-charcoal transition-colors hover:bg-brand-charcoal hover:text-brand-bone"
            >
              Get started
            </TrackedCtaLink>
            <ul className="mt-1 space-y-2.5">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Inklee Plus (featured) */}
          <div className="flex h-full flex-col gap-5 rounded-3xl bg-brand-charcoal p-7 text-shell-fg shadow-shell md:-mt-4 md:mb-[-1rem] md:pb-11 md:pt-9">
            <div>
              <h2 className="text-xl font-black">Inklee Plus</h2>
              <p className="mt-1 text-sm text-shell-fg-dim">
                A small upgrade for solo artists who want more polish and
                control.
              </p>
            </div>
            <p className="flex items-baseline gap-1.5">
              <span className="text-5xl font-black tracking-tight text-brand-mustard">
                &euro;3
              </span>
              <span className="text-sm font-bold text-shell-fg-dim">
                /month
              </span>
            </p>
            <p className="text-xs leading-relaxed text-shell-fg-dim">
              3.00 EUR per month, final price. No VAT added. Renews monthly
              until you cancel. Yearly billing is coming.
            </p>
            <TrackedCtaLink
              cta="pricing-plus-signup"
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
            >
              Get Plus
            </TrackedCtaLink>
            <p className="text-xs text-shell-fg-dim">
              Upgrade when you&apos;re ready, right from your plan settings.
            </p>
            <ul className="mt-1 space-y-2.5">
              <li className="text-xs font-bold uppercase tracking-[0.14em] text-shell-fg-dim">
                Everything in Free, plus:
              </li>
              {PLUS_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check dark />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Studio (coming later) */}
          <div className="flex h-full flex-col gap-5 rounded-3xl bg-[#d9d4c7] p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Studio</h2>
                <p className="mt-1 text-sm text-brand-charcoal/70">
                  For studios with multiple artists.
                </p>
              </div>
              <span className="rounded-full bg-brand-charcoal/8 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-brand-charcoal/70">
                Coming later
              </span>
            </div>
            <p className="flex items-baseline gap-1.5">
              <span className="text-5xl font-black tracking-tight">
                &euro;25
              </span>
              <span className="text-sm font-bold text-brand-charcoal/70">
                /month, planned
              </span>
            </p>
            <p className="text-sm leading-relaxed text-brand-charcoal/75">
              Built for the way real studios work: one studio page, multiple
              artists, a shared request inbox. Solo artists come first, so the
              details land when it ships.
            </p>
            <p className="text-xs text-brand-charcoal/70">
              Run a studio and want in early? Write to hello@inklee.app.
            </p>
          </div>
        </div>

        <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-brand-charcoal/70">
          Built by a tattoo artist, for tattoo artists. No fake testimonials. No
          &quot;free forever&quot; lies. Cancel any time.
        </p>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="bg-shell-bg text-shell-fg">
      <div className="container-marketing py-24 md:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
              FAQ
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
              Pricing, answered.
            </h2>
          </div>
          <div className="rounded-3xl border-[1.5px] border-shell-border bg-[#252525] px-6 md:px-10">
            {PRICING_FAQ.map((item, idx) => {
              const isLast = idx === PRICING_FAQ.length - 1;
              return (
                <details
                  key={item.question}
                  className={`group py-5 ${isLast ? "" : "border-b border-shell-border"}`}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <span className="flex items-center gap-4">
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-mustard">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="text-lg font-bold text-shell-fg">
                        {item.question}
                      </span>
                    </span>
                    <span
                      aria-hidden
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
          <p className="mt-8 text-center text-sm text-shell-fg-dim">
            The legal detail lives in the{" "}
            <Link href="/terms" className="underline hover:text-shell-fg">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="bg-brand-rosa">
      <div className="container-marketing py-24 text-center md:py-32">
        <h2 className="mx-auto max-w-3xl text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl">
          Start with the free plan.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-brand-charcoal/75">
          Your booking link is ready in minutes. Upgrade only if Plus earns it.
        </p>
        <div className="mt-8">
          <TrackedCtaLink
            cta="pricing-final-signup"
            href="/signup"
            className="inline-flex items-center rounded-full bg-brand-charcoal px-8 py-4 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
          >
            Create your booking link
          </TrackedCtaLink>
        </div>
      </div>
    </section>
  );
}
