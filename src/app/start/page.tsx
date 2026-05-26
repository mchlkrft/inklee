import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import StickyCTA from "./sticky-cta";
import ClaimSlugForm from "./claim-slug-form";
import { PillNav, SiteFooter } from "@/components/marketing-v2";

export const metadata: Metadata = {
  title: "Inklee · Your DMs are not a booking system",
  description:
    "Put one clean booking link in your Instagram bio. Turn messy DM chats into structured tattoo booking requests.",
  openGraph: {
    title: "Stop losing tattoo requests in Instagram DMs.",
    description:
      "Inklee gives you a clean booking link for your bio. Clients send structured requests, you review them in one place.",
  },
};

export default async function StartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PillNav />
      <main className="flex-1">
        {/* Hero (charcoal) — text-only, centered. The before/after cards
            below carry the visual, not a hero illustration. */}
        <section className="overflow-hidden md:flex md:min-h-[calc(60svh)] md:items-center">
          <div className="container-marketing-wide w-full">
            <div className="mx-auto max-w-3xl px-2 pb-12 pt-24 text-center md:pb-16 md:pt-28">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                Tattoo booking, simplified
              </p>
              <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
                <span className="block">Stop losing tattoo requests</span>
                <span className="block text-brand-mustard">
                  in Instagram DMs.
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
                Put one clean booking link in your bio and turn messy chats into
                structured tattoo booking requests.
              </p>
              <ClaimSlugForm />
              <p className="mt-4 text-xs text-muted-foreground">
                Built for tattoo artists who want less back-and-forth and more
                real bookings.
              </p>
            </div>
          </div>
        </section>

        {/* Pain (bone) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  The DM problem
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  Instagram gets you attention.
                  <br />
                  It does not give you structure.
                </h2>
                <p className="mt-6 max-w-md text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Managing tattoo bookings through DMs is chaotic by design. It
                  was never built for this.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5">
                {[
                  {
                    label: "Requests buried in chat",
                    text: "Serious inquiries get lost between random messages, story replies, and follow requests. There is no way to separate signal from noise.",
                    variant: "mustard",
                  },
                  {
                    label: "Clients never send enough",
                    text: "Placement? Style? Size? Budget? They skip the details every time and you end up chasing the basics over multiple messages.",
                    variant: "bone-card",
                  },
                  {
                    label: "The same questions, again and again",
                    text: "You type the same follow-up to every single client. It takes time, it is exhausting, and it should not be part of your workflow.",
                    variant: "rosa",
                  },
                  {
                    label: "No overview of what you have",
                    text: "Unless you screenshot everything and hope, you have no clear picture of what is booked, what is pending, or what fell through.",
                    variant: "bone-card",
                  },
                ].map((p) => {
                  const bg =
                    p.variant === "mustard"
                      ? "bg-brand-mustard"
                      : p.variant === "rosa"
                        ? "bg-brand-rosa"
                        : "bg-[#d9d4c7]";
                  return (
                    <div
                      key={p.label}
                      className={`flex flex-col gap-2 rounded-3xl p-6 ${bg}`}
                    >
                      <h3 className="text-lg font-black leading-tight text-brand-charcoal">
                        {p.label}
                      </h3>
                      <p className="text-sm leading-relaxed text-brand-charcoal/75">
                        {p.text}
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
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                How Inklee fixes it
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
                One link.
                <br />
                Cleaner requests.
                <br />
                Less chaos.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Inklee gives you a clean booking link for your Instagram bio.
                Clients click it, fill in the details you actually need, and
                send a proper request. Not a DM.
              </p>
              <p className="mt-3 text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                You get every request in one place, with everything already
                filled in. Review it, accept it, or pass. No back-and-forth
                required.
              </p>
            </div>
          </div>
        </section>

        {/* How it works (bone, 3 steps) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-2xl text-center md:mx-auto md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                How it works
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                Three steps.
                <br />
                Zero detour.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
              {[
                {
                  n: "01",
                  title: "Put your link in bio",
                  text: "Sign up, set up your booking form in minutes, and drop your Inklee link into your Instagram bio.",
                  variant: "mustard",
                },
                {
                  n: "02",
                  title: "Clients send proper requests",
                  text: "They fill in placement, style, size, and description before you ever have to reply. You get everything upfront.",
                  variant: "bone-card",
                },
                {
                  n: "03",
                  title: "You review and accept",
                  text: "Every request lands in your dashboard. Accept, pass, or request a deposit. Accepted bookings go straight to your calendar.",
                  variant: "rosa",
                },
              ].map((s) => {
                const bg =
                  s.variant === "mustard"
                    ? "bg-brand-mustard"
                    : s.variant === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-[#d9d4c7]";
                return (
                  <div
                    key={s.n}
                    className={`flex flex-col gap-4 rounded-3xl p-7 ${bg}`}
                  >
                    <span className="text-5xl font-black leading-none text-brand-charcoal md:text-6xl">
                      {s.n}
                    </span>
                    <h3 className="text-xl font-black leading-tight text-brand-charcoal">
                      {s.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-brand-charcoal/75">
                      {s.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Product proof (charcoal, faux UI on colored cards) */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-24 md:py-32">
            <div className="mb-12 max-w-3xl md:mb-16">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Built to actually work
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                Simple to set up.
                <br />
                Real difference in your booking flow.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
              <ProofCard
                label="Get the details before you reply"
                variant="mustard"
              >
                <BookingFormPreview />
              </ProofCard>
              <ProofCard
                label="Review requests without DM chaos"
                variant="bone"
              >
                <DashboardPreview />
              </ProofCard>
              <ProofCard
                label="Keep accepted bookings in one view"
                variant="rosa"
              >
                <CalendarPreview />
              </ProofCard>
            </div>
          </div>
        </section>

        {/* Credibility (bone) */}
        <section
          data-appearance="light"
          className="bg-brand-bone text-brand-charcoal"
        >
          <div className="container-marketing py-20 md:py-28">
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/illustrations/mixed/inklee-_artist-using-inklee.svg"
                  alt=""
                  aria-hidden="true"
                  className="mx-auto h-auto w-full max-w-sm md:mx-0 md:max-w-md"
                  draggable={false}
                />
              </div>
              <div>
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                  Made for tattoo artists
                </p>
                <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                  Made for tattoo artists,
                  <br />
                  not generic booking software.
                </h2>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                  Inklee is built around the way freelance tattoo artists
                  actually work. Not adapted from a dental appointment tool. Not
                  trying to be an all-in-one platform.
                </p>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-brand-charcoal/75">
                  Whether you work from a studio, run guest spots, or travel
                  between cities, you get a booking flow that fits.
                </p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {[
                    "Solo artists",
                    "Fine line",
                    "Blackwork",
                    "Traditional",
                    "Realism",
                    "Neo-trad",
                    "Guest spot artists",
                    "Traveling artists",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border-[1.5px] border-brand-charcoal/15 px-3 py-1 text-xs font-semibold text-brand-charcoal/75"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust (charcoal) */}
        <section className="bg-shell-bg text-shell-fg">
          <div className="container-marketing py-20 md:py-28">
            <div className="mx-auto max-w-2xl space-y-6">
              <h3 className="text-2xl font-black leading-tight text-shell-fg md:text-3xl">
                Structured like a professional tool.
                <br />
                Built with tattoo artists in mind.
              </h3>
              <div className="space-y-4">
                {[
                  "Your booking link is ready in under 5 minutes.",
                  "GDPR-compliant. Client data stays on European servers.",
                  "No technical setup. No plugins, no integrations to manage.",
                  "Free to get started.",
                ].map((text) => (
                  <div key={text} className="flex items-start gap-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-mustard text-brand-charcoal">
                      <Check
                        className="h-5 w-5"
                        strokeWidth={3}
                        aria-hidden="true"
                      />
                    </span>
                    <p className="pt-2 text-base leading-relaxed text-shell-fg-dim">
                      {text}
                    </p>
                  </div>
                ))}
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
                Your DMs are not
                <br />a booking system.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
                Inklee helps you collect proper tattoo requests, stay organized,
                and spend less time chasing details in chat.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-full bg-brand-charcoal px-8 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
                >
                  Create your booking link
                </Link>
              </div>
              <p className="mt-4 text-xs text-brand-charcoal/70">
                Free to get started. No credit card required.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <StickyCTA />
    </div>
  );
}

// ─── Faux UI mockups for the product-proof section ─────────────────────────

function ProofCard({
  label,
  variant,
  children,
}: {
  label: string;
  variant: "mustard" | "bone" | "rosa";
  children: React.ReactNode;
}) {
  const bg =
    variant === "mustard"
      ? "bg-brand-mustard"
      : variant === "rosa"
        ? "bg-brand-rosa"
        : "bg-brand-bone";
  return (
    <div className={`flex h-full flex-col gap-5 rounded-3xl p-6 ${bg}`}>
      <div className="overflow-hidden rounded-2xl">{children}</div>
      <p className="text-sm font-bold text-brand-charcoal">{label}</p>
    </div>
  );
}

function BookingFormPreview() {
  return (
    <div className="bg-white/55 p-4 space-y-2.5">
      <p className="text-xs font-bold text-brand-charcoal">Tattoo request</p>
      {[
        { label: "Instagram handle", value: "@yourhandle" },
        { label: "Placement", value: "Inner forearm" },
        { label: "Style", value: "Fineline, botanical" },
        { label: "Description", value: "Small rose, minimal shading…" },
      ].map(({ label, value }) => (
        <div key={label} className="space-y-1">
          <p className="text-[10px] font-semibold text-brand-charcoal/70">
            {label}
          </p>
          <div className="rounded-md border-[1.5px] border-brand-charcoal/15 bg-white/60 px-2.5 py-1.5">
            <p className="text-xs text-brand-charcoal">{value}</p>
          </div>
        </div>
      ))}
      <div className="mt-1 rounded-full bg-brand-charcoal py-2 text-center text-[11px] font-bold text-brand-bone">
        Send request
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="bg-brand-charcoal p-3 space-y-2">
      <div className="flex items-center justify-between pb-2">
        <p className="text-xs font-bold text-brand-bone">Requests</p>
        <span className="rounded-full bg-brand-mustard px-2 py-0.5 text-[10px] font-black text-brand-charcoal">
          3 new
        </span>
      </div>
      {[
        {
          name: "Sarah K.",
          detail: "Inner forearm · Fineline",
          status: "pending",
          color: "bg-brand-rosa",
        },
        {
          name: "Marco R.",
          detail: "Shoulder · Traditional",
          status: "approved",
          color: "bg-brand-mustard",
        },
        {
          name: "Lisa M.",
          detail: "Ankle · Blackwork",
          status: "pending",
          color: "bg-brand-bone/40",
        },
      ].map(({ name, detail, status, color }) => (
        <div
          key={name}
          className="flex items-center justify-between gap-2 rounded-xl border-[1.5px] border-shell-border bg-[#252525] px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full ${color}`} />
            <div>
              <p className="text-[11px] font-bold text-brand-bone">{name}</p>
              <p className="text-[10px] text-brand-bone/60">{detail}</p>
            </div>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
              status === "approved"
                ? "bg-brand-mustard text-brand-charcoal"
                : "bg-shell-fg/15 text-shell-fg-dim"
            }`}
          >
            {status}
          </span>
        </div>
      ))}
    </div>
  );
}

function CalendarPreview() {
  // Render the current month at request time so this illustration stays
  // honest — server component, so `new Date()` is the request timestamp.
  const now = new Date();
  const monthName = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayOfWeek = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  const booked = new Set([7, 8, 14, 15, 21, 28]);
  const days = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="bg-white/55 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold text-brand-charcoal">{monthName}</p>
        <p className="text-[10px] font-semibold text-brand-charcoal/60">
          6 bookings
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => (
          <p
            key={i}
            className="pb-1 text-center text-[9px] font-bold text-brand-charcoal/60"
          >
            {d}
          </p>
        ))}
        {Array.from({ length: firstDayOfWeek }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
          <div
            key={day}
            className={`flex h-6 items-center justify-center rounded text-[10px] font-bold ${
              booked.has(day)
                ? "bg-brand-charcoal text-brand-bone"
                : "text-brand-charcoal/60"
            }`}
          >
            {day}
          </div>
        ))}
      </div>
    </div>
  );
}
