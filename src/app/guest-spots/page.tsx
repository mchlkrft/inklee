import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/seo/json-ld";
import { webPageSchema } from "@/lib/jsonld";
import { absoluteUrl } from "@/lib/seo";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

const PAGE_PATH = "/guest-spots";
const PAGE_TITLE = "Guest Spot Booking Tool · Inklee";
const PAGE_DESCRIPTION =
  "Tattoo guest spot booking without spreadsheet chaos. Manage city demand, travel dates, and requests as a traveling tattoo artist.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: "Guest spot bookings without the chaos",
    description:
      "Inklee helps traveling tattoo artists organize guest spot requests, city demand, booking windows, and client details.",
    url: absoluteUrl(PAGE_PATH),
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Guest spot bookings without the chaos",
    description:
      "Inklee helps traveling tattoo artists organize guest spot requests, city demand, booking windows, and client details.",
  },
};

const PAIN_POINTS: Array<{
  title: string;
  body: string;
  variant: "mustard" | "bone-card" | "rosa";
}> = [
  {
    title: "Requests from different cities end up in the same DMs",
    body: "Berlin, Amsterdam, London, all mixed together. You spend time just figuring out who is asking about which trip.",
    variant: "mustard",
  },
  {
    title: "Travel dates and booking windows get mixed up",
    body: "Clients ask about dates that have already passed, or city windows you have not announced yet. Nothing lines up.",
    variant: "bone-card",
  },
  {
    title: "Too much back and forth before a spot is booked",
    body: "Before anything is confirmed you have already answered the same questions five times across three different DM threads.",
    variant: "rosa",
  },
  {
    title: "High booking volume makes everything harder to track",
    body: "The more cities you add, the more requests you get, and the harder it is to keep an overview of what is actually confirmed.",
    variant: "bone-card",
  },
];

const SOLUTION_STEPS = [
  {
    title: "Share your guest spot booking link",
    body: "One link in bio. Clients know exactly where to send their request.",
  },
  {
    title: "They send a request for the right city and dates",
    body: "Size, placement, description, references, and the location they want. All in one go.",
  },
  {
    title: "You review everything in one place",
    body: "No inbox digging. Every request is organized and waiting for you.",
  },
  {
    title: "Approved bookings stay easier to plan",
    body: "Know what is confirmed for which city before you even pack your bags.",
  },
];

const PRODUCT_CARDS: Array<{
  label: string;
  benefit: string;
  variant: "mustard" | "bone" | "rosa";
  Faux: () => React.ReactElement;
}> = [
  {
    label: "Guest spot booking page",
    benefit: "Collect the right details from the start",
    variant: "mustard",
    Faux: () => <FauxGuestSpotForm />,
  },
  {
    label: "Request overview",
    benefit: "Review requests without city or date confusion",
    variant: "bone",
    Faux: () => <FauxRequestOverview />,
  },
  {
    label: "Calendar overview",
    benefit: "Keep guest spot bookings in one clear view",
    variant: "rosa",
    Faux: () => <FauxTripCalendar />,
  },
];

function FauxGuestSpotForm() {
  return (
    <div className="rounded-2xl bg-brand-bone p-4 shadow-card">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-brand-charcoal/60">
        Guest spot request
      </p>
      <div className="space-y-2.5">
        <div>
          <p className="mb-1 text-[10px] font-semibold text-brand-charcoal/70">
            City
          </p>
          <div className="rounded-lg border-[1.5px] border-brand-charcoal/15 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-brand-charcoal">
            Berlin · Aug 12–16
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold text-brand-charcoal/70">
            Placement
          </p>
          <div className="rounded-lg border-[1.5px] border-brand-charcoal/15 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-brand-charcoal">
            Right thigh
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold text-brand-charcoal/70">
            Size
          </p>
          <div className="rounded-lg border-[1.5px] border-brand-charcoal/15 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-brand-charcoal">
            Large
          </div>
        </div>
        <div className="mt-1 rounded-full bg-brand-charcoal py-1.5 text-center text-[11px] font-bold text-brand-bone">
          Send request
        </div>
      </div>
    </div>
  );
}

function FauxRequestOverview() {
  return (
    <div className="space-y-2 rounded-2xl bg-brand-charcoal p-3 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-bone/60">
          Berlin · 5 requests
        </p>
        <span className="rounded-full bg-brand-mustard px-1.5 py-0.5 text-[9px] font-black text-brand-charcoal">
          NEW
        </span>
      </div>
      {["@joana.ink", "@max_inks", "@nadia.t"].map((handle, i) => (
        <div
          key={handle}
          className={`rounded-xl border-[1.5px] border-shell-border bg-[#252525] px-3 py-2 ${i === 2 ? "opacity-60" : ""}`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`h-6 w-6 rounded-full ${i === 0 ? "bg-brand-rosa" : i === 1 ? "bg-brand-mustard" : "bg-brand-bone/40"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-brand-bone">
                {handle}
              </p>
              <p className="truncate text-[10px] text-brand-bone/60">
                Aug 14 · Forearm
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FauxTripCalendar() {
  return (
    <div className="rounded-2xl bg-brand-bone p-3 shadow-card">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-charcoal/60">
        Trips · 2026
      </p>
      <div className="space-y-2">
        <div className="rounded-xl border-[1.5px] border-brand-charcoal/15 bg-white/55 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-charcoal/60">
            Berlin
          </p>
          <p className="text-xs font-bold text-brand-charcoal">Aug 12 – 16</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="h-1.5 w-12 rounded-full bg-brand-mustard" />
            <span className="text-[10px] font-semibold text-brand-charcoal/60">
              5 booked
            </span>
          </div>
        </div>
        <div className="rounded-xl border-[1.5px] border-brand-charcoal/15 bg-white/55 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-charcoal/60">
            Amsterdam
          </p>
          <p className="text-xs font-bold text-brand-charcoal">Sep 4 – 8</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="h-1.5 w-8 rounded-full bg-brand-rosa" />
            <span className="text-[10px] font-semibold text-brand-charcoal/60">
              3 booked
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GuestSpotsPage() {
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
                  Guest spot booking tool
                </p>
                <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  <span className="block">Guest spot bookings</span>
                  <span className="block text-brand-mustard">
                    without the chaos.
                  </span>
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                  Collect structured tattoo requests for the right city and
                  dates with one clean booking flow built for traveling artists.
                </p>
                <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
                  <Link
                    href="/signup"
                    className="inline-flex items-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
                  >
                    Create your guest spot link
                  </Link>
                  <Link
                    href="/guest-spot-booking"
                    className="inline-flex items-center rounded-full border-[1.5px] border-shell-border px-6 py-3 text-base font-bold text-shell-fg-dim transition-colors hover:border-shell-fg hover:text-foreground"
                  >
                    See the booking flow →
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
                <div className="animate-hero-float w-full max-w-sm md:max-w-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/branding/illustrations/mixed/inklee-_artist-guestspot.svg"
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

        {/* Pain (bone, stacked cards on right) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  The guest spot problem
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  Three cities, one inbox,
                  <br />
                  too much mess.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  When you run guest spots, requests from different cities pile
                  into the same DMs. Travel dates and client expectations get
                  confused. You sort it all manually. The admin starts stacking
                  up before the trip even begins.
                </p>
              </div>
              <div className="space-y-4 md:space-y-5">
                {PAIN_POINTS.map((p) => {
                  const bg =
                    p.variant === "mustard"
                      ? "bg-brand-mustard"
                      : p.variant === "rosa"
                        ? "bg-brand-rosa"
                        : "bg-[#d9d4c7]";
                  return (
                    <div
                      key={p.title}
                      className={`flex flex-col gap-2 rounded-3xl p-6 md:p-7 ${bg}`}
                    >
                      <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                        {p.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-brand-charcoal/75">
                        {p.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Solution (mustard) */}
        <section className="bg-brand-mustard">
          <div className="container-marketing py-20 md:py-28">
            <div className="mb-12 max-w-2xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                The Inklee guest spot flow
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                A cleaner booking flow
                <br />
                for life on the road.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                One{" "}
                <Link
                  href="/guest-spot-booking"
                  className="font-bold underline-offset-4 hover:underline"
                >
                  guest spot booking flow
                </Link>{" "}
                that collects the right details upfront, so you can focus on
                tattooing instead of sorting messages.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SOLUTION_STEPS.map((step, i) => (
                <div
                  key={step.title}
                  className="flex flex-col gap-3 rounded-3xl bg-brand-charcoal/8 p-5"
                >
                  <span className="text-4xl font-black leading-none text-brand-charcoal">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-base font-black leading-tight text-brand-charcoal">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-brand-charcoal/75">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Product proof (charcoal, faux UI) */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                What it looks like
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                See the guest spot flow
                <br />
                before the inbox fills up.
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-shell-fg-dim">
                Every request comes in structured, sorted, and ready to act on.
                No chasing. No confusion about which city or which dates.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              {PRODUCT_CARDS.map((card) => {
                const bg =
                  card.variant === "mustard"
                    ? "bg-brand-mustard"
                    : card.variant === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-brand-bone";
                const { Faux } = card;
                return (
                  <div
                    key={card.label}
                    className={`flex h-full flex-col gap-5 rounded-3xl p-6 ${bg}`}
                  >
                    <Faux />
                    <div className="space-y-2">
                      <h3 className="text-xl font-black leading-tight text-brand-charcoal">
                        {card.label}
                      </h3>
                      <p className="text-sm leading-relaxed text-brand-charcoal/75">
                        {card.benefit}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Artist native (bone) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
              <div className="flex justify-center md:justify-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/illustrations/mixed/inklee-_travel-tag.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-auto w-full max-w-2xs md:max-w-sm"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  Built by a tattoo artist
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  By tattoo artists.
                  <br />
                  For tattoo artists.
                </h2>
                <p className="mt-6 max-w-xl text-base font-semibold leading-relaxed text-brand-charcoal md:text-lg">
                  Inklee is built around the real workflow behind tattooing.
                </p>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-brand-charcoal/75">
                  Guest spots, travel dates, booking waves, Instagram messages,
                  reference pictures, and all the admin that starts stacking up
                  when you move between cities. Inklee is built around how that
                  actually works.
                </p>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-brand-charcoal/75">
                  No generic appointment software. Just a cleaner{" "}
                  <Link
                    href="/tattoo-booking-software"
                    className="font-bold underline-offset-4 hover:underline"
                  >
                    booking tool for traveling tattoo artists
                  </Link>{" "}
                  that fits the way they actually work.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/signup"
                    className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
                  >
                    Create your guest spot link
                  </Link>
                </div>
              </div>
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
                Running guest spots?
                <br />
                Put one booking link in bio.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Inklee helps traveling tattoo artists collect structured
                requests, stay organized across cities and dates, and spend less
                time sorting out booking chaos in DMs.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
                >
                  Create your guest spot link
                </Link>
              </div>
              <p className="mx-auto mt-4 text-xs text-brand-charcoal/70">
                Free to get started. No payment required.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
