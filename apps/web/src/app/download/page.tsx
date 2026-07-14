import type { Metadata } from "next";
import Link from "next/link";
import SiteLogo from "@/components/site-logo";
import JsonLd from "@/components/seo/json-ld";
import { absoluteUrl } from "@/lib/seo";
import { webPageSchema } from "@/lib/jsonld";

const PAGE_PATH = "/download";
const PAGE_TITLE = "Inklee app for tattoo artists, on iOS and Android";
const PAGE_DESCRIPTION =
  "The Inklee mobile app for freelance and traveling tattoo artists. Same booking link, client requests, and trip planner in your pocket. iOS and Android.";
const OG_TITLE = "Inklee mobile app for tattoo artists";
const OG_DESCRIPTION =
  "Run your books from your phone. Available on iOS and Android.";

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

/* ── JSON-LD: MobileApplication + WebPage. Page is designed for the
   launched state (the founder will swap the placeholder store links
   for real ones the day the apps ship). Schema marked InStock. */
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
    availability: "https://schema.org/InStock",
    price: "0",
    priceCurrency: "EUR",
  },
};

/* ─── Store badge buttons ──────────────────────────────────────────────────
   Non-functional placeholder links (`href="#"`) until the App Store and
   Google Play listings exist. Visual styling matches the standard
   "Download on the App Store" / "Get it on Google Play" badge shape so
   the page looks like the final launched state. */

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3 20.5V3.5c0-.66.28-1.21.83-1.43L13.62 12 3.83 21.93C3.28 21.7 3 21.16 3 20.5zM16.81 15.19l-2.59 1.49L4.62 22l9.69-9.69 2.5 2.88zm3.59-4.22c.45.32.83.85.83 1.53s-.34 1.17-.83 1.5l-2.27 1.31-2.74-2.81 2.74-2.81 2.27 1.28zM14.31 12L4.62 2l9.6 5.32 2.59 1.49-2.5 2.19z" />
    </svg>
  );
}

function StoreButton({
  platform,
  variant = "dark",
}: {
  platform: "ios" | "android";
  variant?: "dark" | "light";
}) {
  const labelTop = platform === "ios" ? "Download on the" : "Get it on";
  const labelBottom = platform === "ios" ? "App Store" : "Google Play";
  const Icon = platform === "ios" ? AppleIcon : PlayIcon;
  const isDark = variant === "dark";
  return (
    <a
      href="#"
      aria-label={`Download on ${labelBottom}`}
      className={
        isDark
          ? "inline-flex items-center gap-3 rounded-2xl bg-brand-charcoal px-5 py-3 text-shell-fg shadow-card transition-opacity hover:opacity-90"
          : "inline-flex items-center gap-3 rounded-2xl border-[1.5px] border-shell-fg bg-shell-fg px-5 py-3 text-brand-charcoal shadow-card transition-opacity hover:opacity-90"
      }
    >
      <Icon className="h-7 w-7" />
      <span className="text-left leading-tight">
        <span className="block text-[10px] uppercase tracking-wider opacity-70">
          {labelTop}
        </span>
        <span className="block text-base font-bold tracking-tight">
          {labelBottom}
        </span>
      </span>
    </a>
  );
}

function StoreButtonRow({
  variant = "dark",
  align = "start",
}: {
  variant?: "dark" | "light";
  align?: "start" | "center";
}) {
  return (
    <div
      className={`flex flex-wrap gap-3 ${align === "center" ? "justify-center" : ""}`}
    >
      <StoreButton platform="ios" variant={variant} />
      <StoreButton platform="android" variant={variant} />
    </div>
  );
}

/* ─── Floating pill nav — two separate pills (logo + nav/CTA) ────────────
   The single-wide pill read as a too-large bar with a small centered
   wordmark. Splitting into a left logo pill and a right nav pill keeps
   each pill sized to its content and matches the design language the
   broader redesign will adopt. */

function PillNav() {
  return (
    <header className="pointer-events-none sticky top-4 z-50">
      {/* Same container as the body sections so the pills sit on the same
          left/right margin as the hero content. */}
      <div className="container-marketing flex items-center justify-between gap-3">
        {/* Logo pill — left. data-nav-logo hooks it into the mobile
            scroll-grow rule alongside the FAB so both pills stay balanced. */}
        <Link
          href="/"
          aria-label="Inklee home"
          data-nav-logo=""
          className="pointer-events-auto inline-flex items-center rounded-full border-[1.5px] border-shell-border bg-brand-charcoal/95 px-5 py-3 shadow-shell backdrop-blur transition-all duration-300 ease-out hover:bg-brand-charcoal"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/logos/inklee-logo-bone.svg"
            alt="Inklee"
            height={18}
            width={63}
            style={{ width: 63, height: 18 }}
            draggable={false}
          />
        </Link>

        {/* Nav + CTA pill — right. Mobile: transparent flex wrapper, FAB is
            the pill. Desktop (sm:+): full dark-pill container. Matches the
            shared marketing-v2 PillNav structure; the only difference here is
            the "Web → /" link (instead of "App → /download") because we're
            already on the download page. data-fab-cta hooks the FAB into the
            globals.css mobile scroll-grow rule. */}
        <nav className="pointer-events-auto flex items-center gap-1 rounded-full sm:border-[1.5px] sm:border-shell-border sm:bg-brand-charcoal/95 sm:p-1.5 sm:shadow-shell sm:backdrop-blur">
          <Link
            href="/"
            className="hidden rounded-full px-3 py-1.5 text-sm text-shell-fg-dim transition-colors hover:bg-shell-hover hover:text-shell-fg sm:inline-block"
          >
            Web
          </Link>
          <Link
            href="/about"
            className="hidden rounded-full px-3 py-1.5 text-sm text-shell-fg-dim transition-colors hover:bg-shell-hover hover:text-shell-fg sm:inline-block"
          >
            About
          </Link>
          <Link
            href="/signup"
            data-fab-cta=""
            className="rounded-full bg-brand-mustard px-5 py-3 text-base font-bold text-brand-charcoal shadow-shell transition-transform duration-300 ease-out hover:opacity-90 sm:px-5 sm:py-1.5 sm:text-sm sm:shadow-none"
          >
            Get started
          </Link>
        </nav>
      </div>
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

/* ─── Feature card — full-color variants on the charcoal section.
   Switched from monochrome dark cards to bone/mustard/rosa fills so the
   charcoal section reads with energy rather than flatness. All cards
   carry charcoal text for high contrast on every fill colour. */

function FeatureCard({
  number,
  title,
  body,
  variant,
}: {
  number: string;
  title: string;
  body: string;
  variant: "bone" | "mustard" | "rosa";
}) {
  const bgClass =
    variant === "mustard"
      ? "bg-brand-mustard"
      : variant === "rosa"
        ? "bg-brand-rosa"
        : "bg-brand-bone";
  return (
    <div className={`flex h-full flex-col gap-6 rounded-3xl p-7 ${bgClass}`}>
      <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-charcoal/70">
        {number}
      </span>
      <div className="space-y-3">
        <h3 className="text-2xl font-black leading-tight text-brand-charcoal">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-brand-charcoal/75">{body}</p>
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
        className="text-7xl font-black leading-none tracking-tight text-brand-mustard"
        aria-hidden="true"
      >
        {number}
      </span>
      <h3 className="text-xl font-black text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

/* ─── App screens (real mockups) ─────────────────────────────────────────
   Sourced from the founder's App Mockups set; the hero uses the dashboard
   shot, this gallery shows the rest. Assets in public/branding/app/. */

const APP_SCREENS: {
  src: string;
  alt: string;
  title: string;
  body: string;
}[] = [
  {
    src: "/branding/app/app-travel-map.webp",
    alt: "Travel map in the Inklee app showing a four-stop guest spot trip route through Germany",
    title: "Trips on a map",
    body: "Plan guest spots as a route. Each stop keeps its city, dates, and requests together.",
  },
  {
    src: "/branding/app/app-calendar.webp",
    alt: "Bookings calendar in the Inklee app with appointments and guest spots at two studios",
    title: "Your month at a glance",
    body: "Bookings and guest spots side by side. The same calendar as the web, in your pocket.",
  },
  {
    src: "/branding/app/app-artist-shop.webp",
    alt: "Artist shop screen in the Inklee app showing a silkscreen print with size options and prices",
    title: "Your shop, in your pocket",
    body: "Showcase prints, merch, and flash with prices and sizes on your public page.",
  },
];

function AppScreenFigure({
  src,
  alt,
  title,
  body,
}: (typeof APP_SCREENS)[number]) {
  return (
    <figure className="flex flex-col items-center gap-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={1080}
        height={1607}
        loading="lazy"
        decoding="async"
        className="h-auto w-full max-w-[300px]"
        draggable={false}
      />
      <figcaption>
        <h3 className="text-xl font-black leading-tight text-shell-fg">
          {title}
        </h3>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-shell-fg-dim">
          {body}
        </p>
      </figcaption>
    </figure>
  );
}

/* ─── FAQ row ───────────────────────────────────────────────────────────── */

const FAQ_ITEMS: { number: string; question: string; answer: string }[] = [
  {
    number: "01",
    question: "Where do I download the app?",
    answer:
      "Use the App Store and Google Play badges at the top of this page, or the ones in the final section. The app is the same Inklee, on your phone.",
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
    question: "Is the app on iOS and Android?",
    answer:
      "Yes, both. The Inklee app ships on the App Store and Google Play. No staggered rollout.",
  },
  {
    number: "05",
    question: "Will I still need the web app?",
    answer:
      "For setup, the big screen is easier: slot patterns, email templates, booking form fields. For daily booking work (review requests, accept or pass, plan trips, post flash), the phone is the point.",
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
      {/* LCP preload — the hero app mockup renders above the headline on
          mobile, so fetch it at high priority. React 19 hoists this <link>
          into <head> during SSR (same pattern as the homepage hero). */}
      <link
        rel="preload"
        as="image"
        href="/branding/app/app-dashboard.webp"
        fetchPriority="high"
      />
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
        {/* ── Hero (bone) ──────────────────────────────────────────────────
            Bone bg explicit (so the section is unambiguous even if a
            future global change shifts the default). Mobile keeps the
            viewport-centered layout; desktop hugs the content so the hero
            sits higher and the features section starts sooner. */}
        <section className="relative flex min-h-[calc(100svh-80px)] items-center overflow-hidden bg-background pb-16 pt-24 md:min-h-0 md:pb-14 md:pt-20">
          <div className="container-marketing w-full">
            <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-[7fr_5fr] md:gap-12">
              <div>
                {/* Eyebrow pill */}
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border-[1.5px] border-border bg-background/60 px-3 py-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand-mustard" />
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Available on iOS and Android
                  </span>
                </div>

                {/* Hero headline — three lines, mustard accent on key words */}
                <h1 className="text-4xl font-black leading-[1.02] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
                  <span className="block">
                    Run your <span className="text-brand-mustard">books.</span>
                  </span>
                  <span className="block">
                    From your <span className="text-brand-mustard">phone.</span>
                  </span>
                  <span className="block">Without the chaos.</span>
                </h1>

                <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:mt-6 md:text-lg">
                  Same account, same booking link, same client requests. In your
                  pocket while you tattoo, travel, and live offline.
                </p>

                <div className="mt-7 md:mt-8">
                  <StoreButtonRow variant="dark" />
                </div>
              </div>

              <div className="order-first md:order-last">
                {/* Real app mockup (founder's App Mockups set, transparent
                    WebP) — replaced the CSS faux phone that stood in before
                    the app screens existed. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/app/app-dashboard.webp"
                  alt="Inklee app dashboard with 23 booking requests waiting and a new request ready to accept or pass"
                  width={1080}
                  height={1607}
                  fetchPriority="high"
                  decoding="async"
                  loading="eager"
                  className="mx-auto h-auto w-full max-w-[320px] md:max-w-[378px]"
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Features (charcoal) ──────────────────────────────────────── */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing pb-24 pt-16 md:pb-32 md:pt-20">
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
                title="Booking control, in your hand"
                body="See incoming requests with placement, size, and references the moment they land. Accept, pass, or open and close your books with one tap."
                variant="mustard"
              />
              <FeatureCard
                number="02"
                title="Trip planner on the road"
                body="Add a guest spot, set the city and dates, and your booking link updates so clients see where you'll be next."
                variant="bone"
              />
              <FeatureCard
                number="03"
                title="Flash booking organizer"
                body="Snap a flash, add a title and price, and clients can claim it straight from your booking page."
                variant="rosa"
              />
            </div>
          </div>
        </section>

        {/* ── Steps (bone) ─────────────────────────────────────────────── */}
        <section className="bg-background">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 text-center md:mb-20">
              {/* Reaper spiderweb key visual — decorative brand moment above
                  the section heading. aria-hidden because it carries no info. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/illustrations/reaper-spiderweb-key-visual.svg"
                alt=""
                aria-hidden="true"
                className="mx-auto mb-8 w-full max-w-[280px] md:max-w-[360px]"
              />
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
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

        {/* ── App screens (charcoal) — real mockups, transparent WebP with
            the baked-in phone shadows sitting directly on the dark section. */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Straight from the app
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                The screens you&apos;ll
                <br />
                actually live in.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-6 md:gap-8">
              {APP_SCREENS.map((screen) => (
                <AppScreenFigure key={screen.src} {...screen} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Mustard accent block — the one bold color section.
            Two-column on desktop: artist illustration on the left, the
            "built by an artist" claim on the right. */}
        <section className="bg-brand-mustard">
          <div className="container-marketing py-16 md:py-24">
            <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-8 md:grid-cols-[5fr_7fr] md:gap-12">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/illustrations/artist.svg"
                alt=""
                aria-hidden="true"
                className="mx-auto w-full max-w-[220px] md:max-w-[300px]"
              />
              <div className="text-center md:text-left">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  Built by an artist
                </p>
                <p className="text-2xl font-black leading-tight tracking-tight text-brand-charcoal sm:text-3xl md:text-4xl lg:text-5xl">
                  Inklee was started in a studio, not a startup office. The app
                  is the same idea, on your phone.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ (bone) ───────────────────────────────────────────────── */}
        <section className="bg-background">
          <div className="container-marketing py-24 md:py-32">
            <div className="mx-auto max-w-3xl">
              <div className="mb-12 text-center">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
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
                Inklee on iOS and Android. Same account as the web. Free with
                every plan.
              </p>
              <div className="mt-10 flex justify-center">
                <StoreButtonRow variant="light" align="center" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
