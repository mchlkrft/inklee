"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ONBOARDING_ART } from "@inklee/shared/onboarding-art";
import { ONBOARDING_INTRO_SLIDES } from "@inklee/shared/onboarding-intro";

// Instagram-story-style intro. Each slide auto-advances after this many ms;
// the segmented bar at the top doubles as the running timer.
const SLIDE_DURATION = 6500;

const CLAIM_HREF = "/onboarding/claim-slug";

// Slide copy + illustrations both come from @inklee/shared (one source of truth
// with the mobile twin, OnboardingIntro.tsx); each illustration bakes in its own
// brand-colour card, so there is no separate brand-bg / faux-UI per slide.
const SLIDES = ONBOARDING_INTRO_SLIDES;

/** Active timer segment — runs its own rAF tick, fills 0→100% over
 *  SLIDE_DURATION, respects the parent's `isHeldRef` for press-and-hold
 *  pause (Instagram-story behaviour). Remounted via `key={index}` on
 *  the parent so each new slide starts fresh at 0%. */
function ActiveSegment({
  isLast,
  isHeldRef,
  onComplete,
}: {
  isLast: boolean;
  isHeldRef: React.RefObject<boolean>;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState(0);
  // Keep the latest onComplete reachable from the rAF closure without
  // making the timer effect re-run (which would reset elapsed time
  // mid-slide). Updated in its own effect so we never mutate a ref
  // during render.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    let raf = 0;
    const startedAt = performance.now();
    let pausedAccum = 0;
    let pauseStartedAt: number | null = null;

    const tick = (now: number) => {
      if (isHeldRef.current) {
        if (pauseStartedAt === null) pauseStartedAt = now;
      } else if (pauseStartedAt !== null) {
        pausedAccum += now - pauseStartedAt;
        pauseStartedAt = null;
      }

      const elapsed = now - startedAt - pausedAccum;
      const p = Math.min(1, elapsed / SLIDE_DURATION);
      setProgress(p);

      if (p >= 1) {
        // Last slide: fill to 100% and stop. Otherwise advance.
        if (!isLast) onCompleteRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isLast, isHeldRef]);

  return (
    <div
      className="h-full rounded-full bg-foreground"
      style={{ width: `${progress * 100}%` }}
    />
  );
}

// Tap vs hold threshold — releases under this duration count as a tap and
// trigger navigation; over it, the press was a deliberate pause and release
// just resumes the timer.
const TAP_MS = 300;

export default function WelcomeSlides() {
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];
  const art = ONBOARDING_ART[index];

  // Pause state lives in a ref so toggling it doesn't restart the rAF
  // tick effect. The tick reads `isHeldRef.current` each frame.
  const isHeldRef = useRef(false);
  const pressStartTimeRef = useRef<number | null>(null);

  const advance = useCallback(() => {
    setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  }, []);
  const goNext = () => setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  const goPrev = () => setIndex((i) => Math.max(i - 1, 0));

  // Press-and-hold UX — Instagram-story style. Press start pauses the
  // timer; release within TAP_MS counts as a tap and navigates; longer
  // press is a deliberate hold and release just resumes the timer.
  const handlePressStart = () => {
    pressStartTimeRef.current = performance.now();
    isHeldRef.current = true;
  };
  const handlePressEnd = (direction: "prev" | "next" | null) => {
    const startedAt = pressStartTimeRef.current;
    pressStartTimeRef.current = null;
    isHeldRef.current = false;
    if (startedAt !== null && direction !== null) {
      const dur = performance.now() - startedAt;
      if (dur < TAP_MS) {
        if (direction === "prev") goPrev();
        else goNext();
      }
    }
  };

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
            {i === index && (
              <ActiveSegment
                key={index}
                isLast={isLast}
                isHeldRef={isHeldRef}
                onComplete={advance}
              />
            )}
          </div>
        ))}
      </div>

      {/* Illustration card — the brand-colour card + rounded corners are baked
          into the artwork. Tap left third to go back, right to advance. */}
      <div className="relative">
        <svg
          key={index}
          viewBox={art.viewBox}
          aria-hidden="true"
          className="block w-full animate-in fade-in zoom-in-95 duration-500"
          style={{ aspectRatio: art.ratio }}
          dangerouslySetInnerHTML={{ __html: art.inner }}
        />
        {/* Tap zones — story gesture. Press-and-hold pauses the timer;
            quick release (<TAP_MS) counts as a tap and navigates. Pointer
            events fire on touch + mouse + pen. Excluded from tab order
            because the visible Back / Next controls below cover the same
            actions for keyboard users. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onPointerDown={handlePressStart}
          onPointerUp={() => handlePressEnd("prev")}
          onPointerLeave={() => handlePressEnd(null)}
          onPointerCancel={() => handlePressEnd(null)}
          className="absolute inset-y-0 left-0 w-1/3 cursor-default touch-none select-none focus:outline-none"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onPointerDown={handlePressStart}
          onPointerUp={() => handlePressEnd("next")}
          onPointerLeave={() => handlePressEnd(null)}
          onPointerCancel={() => handlePressEnd(null)}
          className="absolute inset-y-0 right-0 w-2/3 cursor-default touch-none select-none focus:outline-none"
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
            className="block w-full rounded-full bg-brand-mustard px-5 py-3 text-center text-sm font-medium text-brand-charcoal"
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
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground"
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
