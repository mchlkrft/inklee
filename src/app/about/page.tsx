import type { Metadata } from "next";
import Link from "next/link";
import SiteLogo from "@/components/site-logo";
import {
  DefinitionBlock,
  FinalCta,
  PlaceholderVisual,
} from "@/components/marketing";
import JsonLd from "@/components/seo/json-ld";
import { webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";

const PAGE_PATH = "/about";
const PAGE_TITLE = "About Inklee | Tattoo Booking Tool for Artists";
const PAGE_DESCRIPTION =
  "Inklee is a tattoo booking request tool built by a tattoo artist to help freelance and traveling artists replace DM chaos with structured requests.";
const OG_TITLE = "About Inklee — built by a tattoo artist, for tattoo artists";
const OG_DESCRIPTION =
  "Why Inklee exists, who it is for, and how it replaces scattered Instagram DMs with a structured tattoo booking flow.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: PAGE_PATH,
  },
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

/* ─── Header / Footer ─────────────────────────────────────────────────────── */

function LandingHeader() {
  return (
    <header className="container-marketing-wide flex items-center justify-between py-5">
      <Link href="/" aria-label="inklee home">
        <SiteLogo height={20} />
      </Link>
      <nav className="flex items-center gap-5">
        <Link
          href="/login"
          className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-md bg-foreground px-4 py-2 text-base font-bold text-background transition-opacity hover:opacity-85"
        >
          Get started free
        </Link>
      </nav>
    </header>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="container-marketing py-8">
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
            © {new Date().getFullYear()} inklee
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function AboutPage() {
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
      <LandingHeader />
      <main className="flex-1">
        <section className="container-marketing py-12 md:py-20">
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                About
              </p>
              <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                About Inklee
              </h1>
              <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground md:text-base">
                <p>
                  Inklee is a tattoo booking request tool built for freelance
                  and traveling tattoo artists who want less chaos in their
                  daily workflow.
                </p>
                <p>
                  It helps artists replace scattered Instagram DMs, screenshots,
                  spreadsheets, and missed messages with one clean booking flow.
                  Clients send proper tattoo requests through a public booking
                  page, while artists review the details before approving what
                  gets booked.
                </p>
              </div>
            </div>
            <div>
              <PlaceholderVisual
                label="Placeholder · main about visual"
                caption="Tattoo artist workspace with booking requests organized through Inklee"
                aspectRatio="wide"
              />
            </div>
          </div>
        </section>

        <div className="h-[15px] bg-brand-rosa" />

        <DefinitionBlock
          heading="Why Inklee exists"
          body={[
            "Tattoo artists often get clients through Instagram, but DMs are not built for booking tattoos. Important details get lost, clients forget references or placement information, and artists end up asking the same questions again and again.",
            "Inklee was founded to make that process easier.",
            "Instead of chasing details across chats, artists can collect the information they actually need from the start: idea, placement, size, references, description, preferred dates, contact details, and more.",
          ]}
        />

        <section className="container-marketing pb-12 md:pb-16">
          <div className="mx-auto max-w-xl">
            <PlaceholderVisual
              label="Placeholder · DM-to-request mini diagram"
              caption="Instagram tattoo DMs turning into a structured tattoo booking request"
              aspectRatio="video"
            />
          </div>
        </section>

        <DefinitionBlock
          heading="Built around the real tattoo workflow"
          body={[
            "Tattoo bookings do not start like normal appointments. They start with an idea.",
            "Before a date makes sense, the artist needs to know what the client wants, where it goes, how big it should be, whether the style fits, and whether the project is worth taking on.",
            "Inklee is built around that decision process, from request intake to approval, deposits, waitlists, guest spots, and organized bookings.",
          ]}
        />

        <DefinitionBlock
          heading="Built by a tattoo artist, for tattoo artists"
          body={[
            "Inklee is not generic appointment software with tattoo words added on top.",
            "It is made for solo artists, freelance artists, Instagram-first artists, and traveling guest spot artists who need more structure without turning their work into corporate admin.",
            "Less back and forth.",
            "Fewer missed requests.",
            "More time to tattoo.",
          ]}
        />

        <div className="h-[15px] bg-brand-red" />

        <DefinitionBlock
          eyebrow="In short"
          heading="What Inklee is, in one sentence"
          body="Inklee is a tattoo booking request tool that helps tattoo artists collect structured client requests, review ideas before approval, manage deposits and waitlists, organize guest spots, and keep bookings out of Instagram DM chaos."
          highlightedTerm="tattoo booking request tool"
        />

        <FinalCta
          heading="Ready to clean up your booking flow?"
          subhead="Put one Inklee link in your bio and let clients send proper tattoo requests instead of scattered DMs."
          primaryCta={{
            label: "Create your booking link",
            href: "/signup",
          }}
        />
      </main>
      <LandingFooter />
    </div>
  );
}
