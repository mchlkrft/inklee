"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import Link from "next/link";

/* ── Dismissal logic ──────────────────────────────────────────────────────── */

const RESHOW_AFTER_DAYS = 7;

// Module-level: suppresses re-show within the same browser tab session
// after the user has already dismissed once this session.
const sessionSeen = new Set<string>();

function lsKey(featureKey: string) {
  return `inklee_intro_${featureKey}`;
}

function shouldAutoShow(featureKey: string): boolean {
  if (sessionSeen.has(featureKey)) return false;
  try {
    const raw = localStorage.getItem(lsKey(featureKey));
    if (!raw) return true; // never seen before
    const { t } = JSON.parse(raw) as { t: number };
    // Re-show after RESHOW_AFTER_DAYS if feature is still empty
    return (Date.now() - t) / 86_400_000 > RESHOW_AFTER_DAYS;
  } catch {
    return true;
  }
}

function recordDismissal(featureKey: string) {
  sessionSeen.add(featureKey);
  try {
    localStorage.setItem(lsKey(featureKey), JSON.stringify({ t: Date.now() }));
  } catch {
    // storage unavailable — silently ignore
  }
}

/* ── Feature config map ───────────────────────────────────────────────────── */

interface FeatureConfig {
  title: string;
  description: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
}

const CONFIGS: Record<string, FeatureConfig> = {
  overview: {
    title: "Your booking requests live here",
    description:
      "Once clients submit your booking form, every request shows up here — ready to review, accept, or pass on.",
    bullets: [
      "See each request with placement, size, and reference images",
      "Accept, pass, or request a deposit in one click",
      "Clients are notified automatically at every step",
    ],
    ctaLabel: "Open your booking form",
    ctaHref: "/bookings/booking-form",
  },

  waitlist: {
    title: "Let clients queue while your books are closed",
    description:
      "When books are closed, clients can join a waitlist instead of hitting a dead end. Re-open any time and move them into real bookings.",
    bullets: [
      "Collect interest while you're fully booked",
      "Move waitlist entries into bookings when you're ready",
      "Keep your pipeline warm between booking rounds",
    ],
    ctaLabel: "Open Books & Availability",
    ctaHref: "/bookings/settings",
  },

  travel: {
    title: "Planning a guest spot? Add it here.",
    description:
      "Add trips and your city, dates, and studio automatically appear on your booking page — no manual updates or extra DMs needed.",
    bullets: [
      "List upcoming guest spots with city, dates, and studio",
      "Clients see your travel schedule directly on your booking page",
      "Take location-specific bookings for each trip",
    ],
    ctaLabel: "Add your first trip",
    ctaHref: "/travel",
  },

  "flash-items": {
    title: "Flash: offer specific designs, not just time slots",
    description:
      "Connect your Instagram and your posted designs become bookable flash — no separate upload needed. Clients browse your feed and claim a piece directly.",
    bullets: [
      "Pull designs straight from your Instagram posts",
      "Clients pick a specific piece, not just an open date",
      "Set each flash as claimable or display-only",
    ],
    ctaLabel: "Create your first flash",
    ctaHref: "/flash/items/new",
  },

  "flash-days": {
    title: "Group your flash into drops and events",
    description:
      "Bundle your Instagram designs into a curated flash day — like a studio event or a themed drop — and share the whole thing as a single link.",
    bullets: [
      "Group flash items into an event with a date and location",
      "Clients see all available pieces in one place",
      "Share the event link anywhere — story, bio, DMs",
    ],
    ctaLabel: "Create your first flash day",
    ctaHref: "/flash/days/new",
  },
};

/* ── Component ────────────────────────────────────────────────────────────── */

export interface FeatureIntroModalProps {
  /** Matches a key in CONFIGS and the localStorage namespace. */
  featureKey: string;
  /**
   * Pass true when the feature has no meaningful data yet.
   * The modal will never auto-show when this is false — once
   * the user has set something up, they no longer need the intro.
   */
  isEmpty: boolean;
}

const noop = () => () => {};

export default function FeatureIntroModal({
  featureKey,
  isEmpty,
}: FeatureIntroModalProps) {
  const config = CONFIGS[featureKey];

  // useSyncExternalStore: server snapshot = false (no localStorage on server),
  // client snapshot = true when the feature is empty and not yet dismissed.
  // Same pattern as RandomizedLogo — avoids hydration mismatch and the
  // react-hooks/set-state-in-effect lint rule.
  const autoOpen = useSyncExternalStore(
    noop,
    () => isEmpty && !!config && shouldAutoShow(featureKey),
    () => false,
  );

  const [open, setOpen] = useState(autoOpen);

  // Keyboard dismiss
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      recordDismissal(featureKey);
      setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, featureKey]);

  if (!config) return null;

  function dismiss() {
    recordDismissal(featureKey);
    setOpen(false);
  }

  return (
    <>
      {/* ── Trigger button — always visible in the page header ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        aria-label={`Learn what ${config.title.toLowerCase()} means`}
      >
        <span className="text-[10px] leading-none opacity-60">ⓘ</span>
        What is this?
      </button>

      {/* ── Modal overlay ── */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={dismiss}
            aria-hidden="true"
          />

          {/* Dialog — centered on all screen sizes */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`intro-title-${featureKey}`}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-2xl max-h-[90vh] overflow-y-auto">
              {/* Body */}
              <div className="space-y-3 p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-mustard">
                  How it works
                </p>
                <h2
                  id={`intro-title-${featureKey}`}
                  className="text-base font-semibold text-foreground"
                >
                  {config.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {config.description}
                </p>
                <ul className="space-y-1.5 pt-1">
                  {config.bullets.map((bullet, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="mt-[3px] shrink-0 text-[9px] text-brand-mustard">
                        ✦
                      </span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
                <button
                  type="button"
                  onClick={dismiss}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Maybe later
                </button>
                <Link
                  href={config.ctaHref}
                  onClick={dismiss}
                  className="rounded-md bg-brand-mustard px-5 py-2 text-sm font-semibold text-brand-charcoal transition-opacity hover:opacity-90"
                >
                  {config.ctaLabel}
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
