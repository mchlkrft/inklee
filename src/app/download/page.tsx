import type { Metadata } from "next";
import Link from "next/link";
import SiteLogo from "@/components/site-logo";
import Spiderweb from "@/components/icons/spiderweb";
import JsonLd from "@/components/seo/json-ld";
import { absoluteUrl } from "@/lib/seo";
import { webPageSchema } from "@/lib/jsonld";
import DevicePreview from "./device-preview";
import MobileWaitlistForm from "./mobile-waitlist-form";

const PAGE_PATH = "/download";
const PAGE_TITLE = "Inklee app for tattoo artists, coming to iOS and Android";
const PAGE_DESCRIPTION =
  "The Inklee mobile app is coming to iOS and Android. Same booking link, same client requests, same trip planner, now in your pocket. Join the launch list to be notified when the app ships.";
const OG_TITLE = "Inklee mobile app for tattoo artists";
const OG_DESCRIPTION =
  "Run your books from your phone. Coming to iOS and Android. Join the launch list.";

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

/* ── JSON-LD: MobileApplication (marked PreOrder / undated) + WebPage ────── */
const mobileAppSchema = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "Inklee",
  description:
    "Tattoo booking and trip planning app for freelance and traveling tattoo artists.",
  operatingSystem: "iOS, Android",
  applicationCategory: "BusinessApplication",
  url: absoluteUrl(PAGE_PATH),
  publisher: { "@type": "Organization", name: "Inklee" },
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/PreOrder",
    price: "0",
    priceCurrency: "EUR",
  },
};

/* ─── Floating pill nav ─────────────────────────────────────────────────── */

function PillNav() {
  return (
    <header className="pointer-events-none sticky top-4 z-50 px-4">
      <nav className="pointer-events-auto mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-full border-[1.5px] border-shell-border bg-brand-charcoal/95 px-3 py-2 shadow-shell backdrop-blur">
        <Link
          href="/"
          aria-label="Inklee home"
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-shell-fg transition-colors hover:bg-shell-hover"
        >
          <Spiderweb className="h-4 w-4" />
          <span className="text-sm font-bold tracking-tight">Inklee</span>
        </Link>
        <div className="flex items-center gap-1 text-sm text-shell-fg-dim">
          <Link
            href="/"
            className="hidden rounded-full px-3 py-1.5 transition-colors hover:bg-shell-hover hover:text-shell-fg sm:inline-block"
          >
            Web
          </Link>
          <Link
            href="/about"
            className="hidden rounded-full px-3 py-1.5 transition-colors hover:bg-shell-hover hover:text-shell-fg sm:inline-block"
          >
            About
          </Link>
        </div>
        <Link
          href="/signup"
          className="rounded-full bg-brand-mustard px-4 py-1.5 text-sm font-bold text-brand-charcoal transition-opacity hover:opacity-90"
        >
          Get started
        </Link>
      </nav>
    </header>
  );
}

/* ─── Marketing footer (matches /tattoo-artist-waitlist + others) ───────── */

function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="container-marketing py-10">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <SiteLogo height={16} />
          <div className="flex gap-5 text-xs text-muted-foreground">
            <Link
              href="/terms"
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/imprint"
              className="transition-colors hover:text-foreground"
            >
              Imprint
            </Link>
          </div>
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Inklee
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ─── Feature card (used inside the charcoal section) ───────────────────── */

function FeatureCard({
  number,
  title,
  body,
  accent,
}: {
  number: string;
  title: string;
  body: string;
  accent: "mustard" | "rosa" | "bone";
}) {
  const accentClass =
    accent === "mustard"
      ? "text-brand-mustard"
      : accent === "rosa"
        ? "text-brand-rosa"
        : "text-brand-bone";
  return (
    <div className="flex h-full flex-col gap-6 rounded-3xl border-[1.5px] border-shell-border bg-[#252525] p-7">
      <span
        className={`text-xs font-black uppercase tracking-[0.18em] ${accentClass}`}
      >
        {number}
      </span>
      <div className="space-y-3">
        <h3 className="text-2xl font-black leading-tight text-shell-fg">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-shell-fg-dim">{body}</p>
      </div>
    </div>
  );
}

/* ─── Step row (numbered 01/02/03 on bone) ──────────────────────────────── */

function StepRow({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="space-y-3">
      <span
        className="text-7xl font-black leading-none tracking-tight text-brand-charcoal/12"
        aria-hidden="true"
      >
        {number}
      </span>
      <h3 className="text-xl font-black text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

/* ─── FAQ row ───────────────────────────────────────────────────────────── */

const FAQ_ITEMS: { number: string; question: string; answer: string }[] = [
  {
    number: "01",
    question: "When does the app launch?",
    answer:
      "We are aiming for a beta in late 2026. The launch date is not locked yet. We will email you once when it is ready, and that is the only email this list sends.",
  },
  {
    number: "02",
    question: "Do I need a separate account for the app?",
    answer:
      "No. Your Inklee account works on both web and mobile. Sign in once, your booking link, slots, trips, and client requests stay in sync across both.",
  },
  {
    number: "03",
    question: "Will the app cost extra?",
    answer:
      "No. The mobile app is included in whichever plan you use on the web. The pricing page on the web will always be the source of truth.",
  },
  {
    number: "04",
    question: "iOS or Android first?",
    answer:
      "Both. The app ships to iOS and Android at the same time. No staggered rollout.",
  },
  {
    number: "05",
    question: "Will I still need the web app?",
    answer:
      "For setup, the big screen is easier: slot patterns, email templates, booking form fields. For daily booking work (review requests, accept or pass, plan trips, message clients), the phone is the point.",
  },
];

function FaqRow({
  number,
  question,
  answer,
}: {
  number: string;
  question: string;
  answer: string;
}) {
  return (
    <details className="group border-b border-border py-5 last:border-b-0">
      <summary className="flex cursor-pointer items-center justify-between gap-4 list-none">
        <div className="flex items-baseline gap-5">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
            {number}
          </span>
          <span className="text-lg font-bold text-foreground">{question}</span>
        </div>
        <span
          aria-hidden="true"
          className="text-2xl font-black text-muted-foreground transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <p className="mt-3 max-w-2xl pl-[3.25rem] text-sm leading-relaxed text-muted-foreground">
        {answer}
      </p>
    </details>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function DownloadPage() {
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
      <JsonLd data={mobileAppSchema} id="ld-mobile-app" />

      <PillNav />

      <main className="flex-1">
        {/* ── Hero (bone) ──────────────────────────────────────────────── */}
        <section className="relative overflow-hidden pb-20 pt-12 md:pb-32 md:pt-20">
          <div className="container-marketing">
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[7fr_5fr] md:gap-8">
              <div>
                {/* Eyebrow pill */}
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border-[1.5px] border-border bg-background/60 px-3 py-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand-mustard" />
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Coming to iOS and Android
                  </span>
                </div>

                {/* Hero headline — three lines, mustard accent on key words */}
                <h1 className="text-5xl font-black leading-[0.95] tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-[112px]">
                  <span className="block">
                    Run your <span className="text-brand-mustard">books.</span>
                  </span>
                  <span className="block">
                    From your <span className="text-brand-mustard">phone.</span>
                  </span>
                  <span className="block">Without the chaos.</span>
                </h1>

                <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:mt-8 md:text-lg">
                  Coming to iOS and Android. Same account, same booking link,
                  same client requests. Now in your pocket while you tattoo,
                  travel, and live offline.
                </p>

                <div className="mt-8 max-w-md">
                  <MobileWaitlistForm formId="mobile-waitlist-hero" />
                </div>

                <p className="mt-6 text-sm text-muted-foreground">
                  Built by a tattoo artist. The web app is already live at{" "}
                  <Link
                    href="/"
                    className="font-bold text-foreground underline-offset-4 hover:underline"
                  >
                    inklee.app
                  </Link>
                  .
                </p>
              </div>

              <div className="order-first md:order-last">
                <DevicePreview />
              </div>
            </div>
          </div>
        </section>

        {/* ── Features (charcoal) ──────────────────────────────────────── */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                What ships with the app
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                Everything in your pocket.
                <br />
                Nothing you don&apos;t need.
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-shell-fg-dim">
                The mobile app does the work tattoo artists actually do on their
                phone between sessions. Setup stays on the web, where the big
                screen helps.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              <FeatureCard
                number="01"
                title="Requests in hand"
                body="See booking requests as they land, with the client's references, placement, and size visible at a glance. Accept, pass, or request a deposit without opening a laptop."
                accent="mustard"
              />
              <FeatureCard
                number="02"
                title="Trip planner on the road"
                body="Add a guest spot while you are still in the city, set the dates, and your booking link updates so the next client sees it instantly. No spreadsheets, no DMs to update."
                accent="rosa"
              />
              <FeatureCard
                number="03"
                title="Books status, one tap"
                body="Close your books when the day is full. Reopen them when you are ready for more. No more closed-books DMs you have to write yourself."
                accent="bone"
              />
            </div>
          </div>
        </section>

        {/* ── Steps (bone) ─────────────────────────────────────────────── */}
        <section className="bg-background">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 text-center md:mb-20">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                How it fits together
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Same account.
                <br />
                Same booking flow.
              </h2>
            </div>

            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-12 md:grid-cols-3 md:gap-10">
              <StepRow
                number="01"
                title="Set up on the web"
                body="Claim your slug, build your booking form, set your slot patterns. The web app stays the home for setup and configuration."
              />
              <StepRow
                number="02"
                title="Take requests anywhere"
                body="Sign in to the app once. New booking requests, trip changes, and waitlist activity push to your phone the moment they happen."
              />
              <StepRow
                number="03"
                title="Decide between sessions"
                body="Approve a piece, send a deposit request, or move a request to your waitlist in two taps. The rest of your day stays uninterrupted."
              />
            </div>
          </div>
        </section>

        {/* ── Mustard accent block — the one bold color section ─────────── */}
        <section className="bg-brand-mustard">
          <div className="container-marketing py-20 md:py-28">
            <div className="mx-auto max-w-4xl text-center">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                Built by a tattoo artist
              </p>
              <p className="text-3xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl">
                Inklee was started in a studio,
                <br className="hidden md:block" /> not a startup office. The app
                is the same idea, on your phone.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ (bone) ───────────────────────────────────────────────── */}
        <section className="bg-background">
          <div className="container-marketing py-24 md:py-32">
            <div className="mx-auto max-w-3xl">
              <div className="mb-12 text-center">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  FAQ
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
                  Quick answers.
                </h2>
              </div>
              <div className="rounded-3xl border-[1.5px] border-border bg-background px-6 md:px-10">
                {FAQ_ITEMS.map((item) => (
                  <FaqRow key={item.number} {...item} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA (charcoal) ─────────────────────────────────────── */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-6xl lg:text-7xl">
                Your booking flow,
                <br />
                in your <span className="text-brand-mustard">pocket.</span>
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-shell-fg-dim md:text-lg">
                Drop your email. We will tell you the day the app ships. That is
                it.
              </p>
              <div className="mx-auto mt-10 max-w-md">
                <MobileWaitlistForm
                  variant="charcoal"
                  formId="mobile-waitlist-final"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
