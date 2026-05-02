import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import StickyCTA from "./sticky-cta";

export const metadata: Metadata = {
  title: "Inklee — Your DMs are not a booking system",
  description:
    "Put one clean booking link in your Instagram bio. Turn messy DM chats into structured tattoo booking requests.",
  openGraph: {
    title: "Stop losing tattoo requests in Instagram DMs.",
    description:
      "Inklee gives you a clean booking link for your bio. Clients send structured requests — you review them in one place.",
  },
};

export default async function StartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-foreground"
        >
          inklee
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* ─── Hero ────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 pb-12 pt-12 text-center md:pt-20">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
            Stop losing tattoo requests
            <br className="hidden sm:block" /> in Instagram DMs.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
            Put one clean booking link in your bio and turn messy chats into
            structured tattoo booking requests.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-block w-full rounded-md bg-brand-mustard px-8 py-3.5 text-center text-sm font-medium text-brand-charcoal sm:w-auto"
            >
              Create your booking link
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">
              Built for tattoo artists who want less back-and-forth and more
              real bookings.
            </p>
          </div>
        </section>

        {/* ─── Hero visual: DM chaos vs clean request ──────────────────── */}
        <section className="mx-auto max-w-3xl px-6 pb-20">
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-5">
            {/* Before: DM chaos */}
            <div className="rounded-md border border-border bg-card p-4 sm:p-5">
              <p className="mb-4 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Your DMs right now
              </p>
              <div className="space-y-3">
                {[
                  { msg: "hey do u have space next month?? 🙏", ago: "2d" },
                  { msg: "how much for a small wrist tattoo", ago: "1d" },
                  {
                    msg: "hii!! love ur work, can u do mine? i have a pic",
                    ago: "6h",
                  },
                  { msg: "still waiting to hear back…", ago: "3h" },
                ].map(({ msg, ago }, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug text-foreground">
                        {msg}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {ago} ago
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 border-t border-border pt-3 text-[10px] text-muted-foreground">
                + 34 more messages
              </p>
            </div>

            {/* After: Inklee request */}
            <div className="rounded-md border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Booking request
                </p>
                <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-500">
                  New
                </span>
              </div>
              <div className="space-y-3">
                {[
                  ["Placement", "Inner forearm, right arm"],
                  ["Style", "Fineline, botanical"],
                  ["Size", "approx. 10 × 6 cm"],
                  ["Description", "Single stem rose, minimal shading"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[10px] text-muted-foreground">{k}</p>
                    <p className="text-xs leading-snug text-foreground">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2 border-t border-border pt-3">
                <div className="flex-1 rounded-md bg-foreground/10 px-3 py-1.5 text-center text-[11px] font-medium text-foreground">
                  Approve
                </div>
                <div className="flex-1 rounded-md border border-border px-3 py-1.5 text-center text-[11px] text-muted-foreground">
                  Decline
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Pain ────────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold leading-snug text-foreground sm:text-3xl">
                Instagram gets you attention.
                <br />
                It doesn&apos;t give you structure.
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Managing tattoo bookings through DMs is chaotic by design. It
                was never built for this.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PainPoint
                label="Requests buried in chat"
                text="Serious inquiries get lost between random messages, story replies, and follow requests. There is no way to separate signal from noise."
              />
              <PainPoint
                label="Clients never send enough"
                text="Placement? Style? Size? Budget? They skip the details every time and you end up chasing the basics over multiple messages."
              />
              <PainPoint
                label="The same questions, again and again"
                text="You type the same follow-up to every single client. It takes time, it is exhausting, and it should not be part of your workflow."
              />
              <PainPoint
                label="No overview of what you have"
                text="Unless you screenshot everything and hope, you have no clear picture of what is booked, what is pending, or what fell through."
              />
            </div>
          </div>
        </section>

        {/* ─── Solution ────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold leading-snug text-foreground sm:text-3xl">
                One link. Cleaner requests.
                <br />
                Less chaos.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Inklee gives you a clean booking link for your Instagram bio.
                Clients click it, fill in the details you actually need, and
                send a proper request — not a DM.
              </p>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                You get every request in one place, with everything already
                filled in. Review it, approve it, or pass — no back-and-forth
                required.
              </p>
            </div>
          </div>
        </section>

        {/* ─── How it works ────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              How it works
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
              <Step
                number="01"
                title="Put your link in bio"
                text="Sign up, set up your booking form in minutes, and drop your Inklee link into your Instagram bio."
              />
              <Step
                number="02"
                title="Clients send proper requests"
                text="They fill in placement, style, size, and description before you ever have to reply. You get everything upfront."
              />
              <Step
                number="03"
                title="You review and approve"
                text="Every request lands in your dashboard. Approve, decline, or request a deposit. Approved bookings go straight to your calendar."
              />
            </div>
          </div>
        </section>

        {/* ─── Product proof ───────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              Built to actually work
            </h2>
            <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
              Simple enough to set up in minutes. Structured enough to make a
              real difference.
            </p>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <ProofCard label="Get the details before you reply">
                <BookingFormPreview />
              </ProofCard>
              <ProofCard label="Review requests without DM chaos">
                <DashboardPreview />
              </ProofCard>
              <ProofCard label="Keep approved bookings in one view">
                <CalendarPreview />
              </ProofCard>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              ↑ Replace these with real screenshots once available.
            </p>
          </div>
        </section>

        {/* ─── Credibility ─────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <div className="max-w-lg">
              <h2 className="text-2xl font-semibold leading-snug text-foreground sm:text-3xl">
                Made for tattoo artists,
                <br />
                not generic booking software.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Inklee is built around the way freelance tattoo artists actually
                work. Not adapted from a dental appointment tool. Not trying to
                be an all-in-one platform.
              </p>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Whether you work from a studio, run guest spots, or travel
                between cities — you get a booking flow that fits.
              </p>
            </div>
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
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Trust ───────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <div className="grid grid-cols-1 gap-14 sm:grid-cols-2">
              <div className="space-y-8">
                <Quote
                  text="Finally a tool that handles the boring parts — I just focus on the tattooing."
                  author="Tattoo artist, Berlin"
                />
                <Quote
                  text="My clients love it. They fill in the form and I get everything I need in one place."
                  author="Freelance artist, Amsterdam"
                />
                <p className="text-xs text-muted-foreground">
                  ↑ Replace with real quotes when available.
                </p>
              </div>
              <div className="space-y-5">
                <h3 className="text-base font-semibold text-foreground">
                  Structured like a professional tool. Built with tattoo artists
                  in mind.
                </h3>
                <TrustPoint text="Your booking link is ready in under 5 minutes." />
                <TrustPoint text="GDPR-compliant. Client data stays on European servers." />
                <TrustPoint text="No technical setup. No plugins, no integrations to manage." />
                <TrustPoint text="Free to get started." />
              </div>
            </div>
          </div>
        </section>

        {/* ─── Final CTA ───────────────────────────────────────────────── */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-3xl px-6 py-24 text-center">
            <h2 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
              Your DMs are not a booking system.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Inklee helps you collect proper tattoo requests, stay organized,
              and spend less time chasing details in chat.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-block w-full rounded-md bg-brand-mustard px-8 py-3.5 text-center text-sm font-medium text-brand-charcoal sm:w-auto"
            >
              Create your booking link
            </Link>
            <p className="mt-3 text-xs text-muted-foreground">
              Free to get started. No credit card required.
            </p>
          </div>
        </section>
      </main>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-border px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-xs text-muted-foreground sm:flex-row">
          <span className="font-medium text-foreground">inklee</span>
          <div className="flex gap-5">
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
        </div>
      </footer>

      {/* Sticky mobile CTA — appears after scrolling past hero */}
      <StickyCTA />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function PainPoint({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-border p-5 space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function Step({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-2xl font-semibold text-foreground/15">
        {number}
      </p>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function ProofCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border bg-card">
        {children}
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function Quote({ text, author }: { text: string; author: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed text-foreground">
        &ldquo;{text}&rdquo;
      </p>
      <p className="text-xs text-muted-foreground">— {author}</p>
    </div>
  );
}

function TrustPoint({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground">→</span>
      <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

// ─── Product mockup previews ─────────────────────────────────────────────────
// Placeholder UI — replace with real screenshots when available.

function BookingFormPreview() {
  return (
    <div className="select-none p-4 space-y-3 pointer-events-none">
      <p className="text-xs font-medium text-foreground">Tattoo request</p>
      {[
        { label: "Instagram handle", value: "@yourhandle" },
        { label: "Placement", value: "Inner forearm" },
        { label: "Style", value: "Fineline, botanical" },
        { label: "Description", value: "Small rose, minimal shading…" },
      ].map(({ label, value }) => (
        <div key={label} className="space-y-1">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <div className="rounded border border-border px-2.5 py-1.5">
            <p className="text-xs text-foreground">{value}</p>
          </div>
        </div>
      ))}
      <div className="mt-1 rounded-md bg-foreground/10 py-2 text-center text-[11px] font-medium text-foreground">
        Send request
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="select-none p-4 space-y-1 pointer-events-none">
      <div className="flex items-center justify-between pb-3">
        <p className="text-xs font-medium text-foreground">Requests</p>
        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] text-foreground">
          3 new
        </span>
      </div>
      {[
        {
          name: "Sarah K.",
          detail: "Inner forearm · Fineline",
          status: "pending",
        },
        {
          name: "Marco R.",
          detail: "Shoulder · Traditional",
          status: "approved",
        },
        { name: "Lisa M.", detail: "Ankle · Blackwork", status: "pending" },
      ].map(({ name, detail, status }) => (
        <div
          key={name}
          className="flex items-center justify-between gap-2 border-t border-border py-2.5"
        >
          <div>
            <p className="text-xs font-medium text-foreground">{name}</p>
            <p className="text-[10px] text-muted-foreground">{detail}</p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              status === "approved"
                ? "bg-green-500/15 text-green-500"
                : "bg-muted text-muted-foreground"
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
  // May 2025 — starts Thursday (index 3, Mon=0)
  const booked = new Set([7, 8, 14, 15, 21, 28]);
  const days = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="select-none p-4 pointer-events-none">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">May 2025</p>
        <p className="text-[10px] text-muted-foreground">6 bookings</p>
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((d, i) => (
          <p
            key={i}
            className="pb-1 text-center text-[9px] font-medium text-muted-foreground"
          >
            {d}
          </p>
        ))}
        {/* padding: May 1 is Thursday = 3 empty cells (Mon, Tue, Wed) */}
        {[0, 1, 2].map((i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
          <div
            key={day}
            className={`flex h-6 items-center justify-center rounded text-[10px] ${
              booked.has(day)
                ? "bg-foreground font-semibold text-brand-charcoal"
                : "text-muted-foreground"
            }`}
          >
            {day}
          </div>
        ))}
      </div>
    </div>
  );
}
