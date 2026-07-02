import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/seo/json-ld";
import { webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

const PAGE_PATH = "/about";
const PAGE_TITLE = "About Inklee · Built by a tattoo artist for tattoo artists";
const PAGE_DESCRIPTION =
  "Inklee is a tattoo booking request tool built by a tattoo artist to help freelance and traveling artists replace DM chaos with structured requests.";
const OG_TITLE = "About Inklee, built by a tattoo artist for tattoo artists";
const OG_DESCRIPTION =
  "Why Inklee exists, who it is for, and how it replaces scattered Instagram DMs with a structured tattoo booking flow.";

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
      <PillNav />
      <main className="flex-1">
        {/* Hero (charcoal) */}
        <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
          <div className="container-marketing-wide">
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
              <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                  About Inklee
                </p>
                <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  <span className="block">Booking tools</span>
                  <span className="block text-brand-mustard">
                    by a tattoo artist.
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                  Inklee is a tattoo booking request tool built for freelance
                  and traveling tattoo artists who want less chaos in their
                  daily workflow.
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
                    See the booking tool →
                  </Link>
                </div>
              </div>
              <div className="order-1 flex justify-center pt-5 md:order-2 md:pt-0">
                <div className="animate-hero-float w-full max-w-2xs md:max-w-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/branding/illustrations/mixed/inklee-_artist-using-inklee.svg"
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

        {/* Why it exists (bone) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[6fr_6fr] md:gap-16">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/illustrations/mixed/inklee-_DM-to-Booking-Form.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-auto w-full max-w-sm md:mx-0 md:max-w-md"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  Why Inklee exists
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  DMs were never built
                  <br />
                  for booking tattoos.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Tattoo artists often get clients through Instagram, but DMs
                  are not built for booking tattoos. Important details get lost,
                  clients forget references or placement information, and
                  artists end up asking the same questions again and again.
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Inklee was founded to make that process easier. Instead of
                  chasing details across chats, artists can collect the
                  information they actually need from the start: idea,
                  placement, size, references, description, preferred dates, and
                  contact details.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Built around the workflow (charcoal) */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                  Built around the workflow
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                  Tattoo bookings start
                  <br />
                  with an idea, not a slot.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-shell-fg-dim md:text-lg">
                  Tattoo bookings do not start like normal appointments. They
                  start with an idea.
                </p>
              </div>
              <div className="space-y-4 md:space-y-5">
                {[
                  {
                    title: "Before a date makes sense",
                    text: "The artist needs to know what the client wants, where it goes, how big it should be, whether the style fits, and whether the project is worth taking on.",
                    variant: "mustard",
                  },
                  {
                    title: "Built around that decision",
                    text: "Inklee is built around that review process, from request intake to approval, deposits, waitlists, guest spots, and organized bookings.",
                    variant: "bone-card",
                  },
                  {
                    title: "Not a generic scheduler",
                    text: "It is not generic appointment software with tattoo words added on top. It is made for the way custom tattoo work actually happens.",
                    variant: "rosa",
                  },
                ].map((c) => {
                  const bg =
                    c.variant === "mustard"
                      ? "bg-brand-mustard"
                      : c.variant === "rosa"
                        ? "bg-brand-rosa"
                        : "bg-brand-bone";
                  return (
                    <div
                      key={c.title}
                      className={`flex flex-col gap-2 rounded-3xl p-6 md:p-7 ${bg}`}
                    >
                      <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                        {c.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-brand-charcoal/75">
                        {c.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* By tattoo artists, for tattoo artists (mustard) */}
        <section className="bg-brand-mustard">
          <div className="container-marketing py-20 md:py-28">
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/illustrations/mixed/inklee-_artist-drawing-on-ipad.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-auto w-full max-w-xs md:mx-0 md:max-w-sm"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  By tattoo artists, for tattoo artists
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                  Less back and forth.
                  <br />
                  Fewer missed requests.
                  <br />
                  More time to tattoo.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Inklee is made for solo artists, freelance artists,
                  Instagram-first artists, and traveling guest spot artists who
                  need more structure without turning their work into corporate
                  admin.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* In one sentence (bone) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                In one sentence
              </p>
              <h2 className="text-3xl font-black leading-tight tracking-tight text-brand-rosa md:text-4xl lg:text-5xl">
                Inklee is a{" "}
                <span className="text-brand-charcoal">
                  tattoo booking request tool
                </span>{" "}
                that helps tattoo artists collect structured client requests,
                review ideas before approval, manage deposits and waitlists,
                organize guest spots, and keep bookings out of Instagram DM
                chaos.
              </h2>
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
                Ready to clean up
                <br />
                your booking flow?
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Put one Inklee link in your bio and let clients send proper
                tattoo requests instead of scattered DMs.
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
