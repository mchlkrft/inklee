"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Link2,
  Image as ImageIcon,
  Check,
  Sparkles,
  ChevronLeft,
} from "lucide-react";

// Instagram-story-style intro. Each slide auto-advances after this many ms;
// the segmented bar at the top doubles as the running timer.
const SLIDE_DURATION = 6500;

const CLAIM_HREF = "/onboarding/claim-slug";

/* ── Slide visuals ──────────────────────────────────────────────────────────
   Each visual sits on a solid brand-color card so it reads the same in light
   and dark — the faux UI inside uses bone panels + charcoal accents only. */

function LinkVisual() {
  return (
    <div className="flex h-full items-center justify-center p-7">
      <div className="w-full max-w-[230px] rounded-2xl bg-brand-bone p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-charcoal/10">
            <Sparkles className="h-5 w-5 text-brand-charcoal/45" />
          </div>
          <div className="space-y-1.5">
            <div className="h-2.5 w-20 rounded-full bg-brand-charcoal/25" />
            <div className="h-2 w-14 rounded-full bg-brand-charcoal/12" />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-brand-charcoal px-3 py-2.5">
          <Link2 className="h-4 w-4 shrink-0 text-brand-mustard" />
          <span className="truncate text-xs font-medium text-brand-bone">
            inklee.app/you
          </span>
        </div>
        <div className="mt-2.5 h-2 w-2/3 rounded-full bg-brand-charcoal/10" />
      </div>
    </div>
  );
}

function RequestVisual() {
  return (
    <div className="flex h-full items-center justify-center p-7">
      <div className="w-full max-w-[235px] space-y-3 rounded-2xl bg-brand-bone p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-brand-charcoal/10" />
            <div className="h-2.5 w-16 rounded-full bg-brand-charcoal/22" />
          </div>
          <span className="rounded-full bg-brand-rosa px-2 py-0.5 text-[9px] font-semibold text-brand-charcoal">
            New
          </span>
        </div>
        {["Placement", "Style", "Size"].map((field) => (
          <div key={field} className="flex items-center gap-2">
            <span className="shrink-0 rounded-md bg-brand-charcoal/10 px-2 py-1 text-[9px] font-medium text-brand-charcoal/70">
              {field}
            </span>
            <div className="h-2 flex-1 rounded-full bg-brand-charcoal/12" />
          </div>
        ))}
        <div className="flex gap-1.5 pt-0.5">
          <div className="h-10 flex-1 rounded-lg bg-brand-charcoal/[0.07]" />
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-charcoal/[0.07]">
            <ImageIcon className="h-4 w-4 text-brand-charcoal/30" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ApproveVisual() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-7">
      <div className="w-full max-w-[235px] space-y-3 rounded-2xl bg-brand-bone p-4 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-brand-charcoal/10" />
          <div className="space-y-1.5">
            <div className="h-2 w-16 rounded-full bg-brand-charcoal/22" />
            <div className="h-1.5 w-10 rounded-full bg-brand-charcoal/12" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-brand-mustard text-[10px] font-semibold text-brand-charcoal">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Accept
          </div>
          <div className="h-8 w-16 rounded-lg border border-brand-charcoal/15" />
        </div>
      </div>
      <div className="w-full max-w-[235px] rounded-2xl bg-brand-bone p-3 shadow-xl">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 21 }).map((_, i) => (
            <div
              key={i}
              className={`flex aspect-square items-center justify-center rounded-[5px] ${
                i === 9 ? "bg-brand-green" : "bg-brand-charcoal/[0.07]"
              }`}
            >
              {i === 9 && (
                <Check
                  className="h-2.5 w-2.5 text-brand-bone"
                  strokeWidth={3}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SLIDES = [
  {
    bg: "bg-brand-mustard",
    eyebrow: "Your booking link",
    title: "One link. Every booking.",
    body: "Drop a single Inklee link in your Instagram bio. Clients tap it to start a request — no more booking chaos buried in your DMs.",
    Visual: LinkVisual,
  },
  {
    bg: "bg-brand-rosa",
    eyebrow: "Your inbox",
    title: "Requests, already sorted.",
    body: "Every client tells you placement, style, size and a reference up front. Each request lands in one tidy dashboard, ready to review.",
    Visual: RequestVisual,
  },
  {
    bg: "bg-brand-green",
    eyebrow: "Your calendar",
    title: "Review, approve, done.",
    body: "Accept or pass with a tap. Approved bookings move straight to your calendar — so you stay in control and organised.",
    Visual: ApproveVisual,
  },
] as const;

/** Active timer segment — fills 0→100% over SLIDE_DURATION, remounts per slide. */
function SegmentFill() {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(100));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className="h-full rounded-full bg-foreground"
      style={{
        width: `${width}%`,
        transition: `width ${SLIDE_DURATION}ms linear`,
      }}
    />
  );
}

export default function WelcomeSlides() {
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];
  const { Visual } = slide;

  // Auto-advance — the last slide holds, waiting for an explicit choice.
  useEffect(() => {
    if (isLast) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), SLIDE_DURATION);
    return () => clearTimeout(timer);
  }, [index, isLast]);

  const goNext = () => setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  const goPrev = () => setIndex((i) => Math.max(i - 1, 0));

  return (
    <div className="space-y-5">
      {/* Story timer — one segment per slide */}
      <div className="flex gap-1.5">
        {SLIDES.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/15"
          >
            {i < index && (
              <div className="h-full w-full rounded-full bg-foreground" />
            )}
            {i === index && <SegmentFill key={index} />}
          </div>
        ))}
      </div>

      {/* Visual card — tap left third to go back, right to advance */}
      <div className="relative">
        <div
          className={`relative aspect-[4/5] overflow-hidden rounded-[28px] ${slide.bg}`}
        >
          <div
            key={index}
            className="h-full w-full animate-in fade-in zoom-in-95 duration-500"
          >
            <Visual />
          </div>
        </div>
        {/* Tap zones — story gesture. Excluded from tab order since the
            visible Back / Next controls below cover the same actions. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={goPrev}
          className="absolute inset-y-0 left-0 w-1/3 cursor-default focus:outline-none"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={goNext}
          className="absolute inset-y-0 right-0 w-2/3 cursor-default focus:outline-none"
        />
      </div>

      {/* Copy */}
      <div
        key={index}
        className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {slide.eyebrow}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {slide.title}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {slide.body}
        </p>
      </div>

      {/* Controls */}
      {isLast ? (
        <div className="space-y-3">
          <Link
            href={CLAIM_HREF}
            className="block w-full rounded-md bg-brand-mustard px-4 py-3 text-center text-sm font-medium text-brand-charcoal"
          >
            Start setup →
          </Link>
          <button
            type="button"
            onClick={goPrev}
            className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            className={`flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground ${
              index === 0 ? "invisible" : ""
            }`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <button
            type="button"
            onClick={goNext}
            className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground"
          >
            Next →
          </button>
        </div>
      )}

      <Link
        href={CLAIM_HREF}
        className="block text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Skip intro
      </Link>
    </div>
  );
}
