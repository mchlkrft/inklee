"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Floating two-pill nav shared across all redesigned marketing pages.
 *
 *  Mobile layout: only the logo (left) and the mustard "Get started"
 *  FAB (right) are visible. Both pills sit at body-button height
 *  (px-5 py-3 / text-base) so the FAB matches the logo pill visually.
 *
 *  Desktop layout: the right pill becomes a multi-button container
 *  (App / About / Log in / Get started) with smaller nav-link sizing
 *  (px-4 py-1.5 text-sm) and a charcoal pill background around all of
 *  them. The FAB shrinks to match the nav-link sizing on desktop too.
 *
 *  Mobile scroll affordance: the FAB starts at scale-90 (slightly
 *  shrunken) and grows to scale-100 once the visitor scrolls past
 *  SCROLL_THRESHOLD pixels. Transform-based animation = single
 *  property change, GPU-accelerated, no layout shift. Locked to
 *  scale-100 on desktop via sm:scale-100. */

const SCROLL_THRESHOLD = 60;

export default function PillNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    }
    onScroll(); // initial check
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none sticky top-4 z-50">
      <div className="container-marketing flex items-center justify-between gap-3">
        {/* Logo pill — body-button height (py-3 text-base baseline) */}
        <Link
          href="/"
          aria-label="Inklee home"
          className="pointer-events-auto inline-flex items-center rounded-full border-[1.5px] border-shell-border bg-brand-charcoal/95 px-5 py-3 shadow-shell backdrop-blur transition-colors hover:bg-brand-charcoal"
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

        {/* Right nav. On mobile this is a transparent flex container —
            the FAB itself is the pill. On desktop (sm+) the container
            gets the full pill treatment (border, bg, padding, shadow)
            and houses the additional nav links. */}
        <nav className="pointer-events-auto flex items-center gap-1 rounded-full sm:border-[1.5px] sm:border-shell-border sm:bg-brand-charcoal/95 sm:p-1.5 sm:shadow-shell sm:backdrop-blur">
          <Link
            href="/download"
            className="hidden rounded-full px-3 py-1.5 text-sm text-shell-fg-dim transition-colors hover:bg-shell-hover hover:text-shell-fg sm:inline-block"
          >
            App
          </Link>
          <Link
            href="/about"
            className="hidden rounded-full px-3 py-1.5 text-sm text-shell-fg-dim transition-colors hover:bg-shell-hover hover:text-shell-fg sm:inline-block"
          >
            About
          </Link>
          <Link
            href="/login"
            className="hidden rounded-full px-3 py-1.5 text-sm text-shell-fg-dim transition-colors hover:bg-shell-hover hover:text-shell-fg sm:inline-block"
          >
            Log in
          </Link>
          {/* Get started FAB. Mobile defaults to body-button sizing
              (px-5 py-3 text-base shadow-shell) so it matches the logo
              pill. Scroll effect: starts scale-90, grows to scale-100
              past SCROLL_THRESHOLD. sm:* overrides shrink it on
              desktop to nav-link sizing inside the wider pill. */}
          <Link
            href="/signup"
            className={`origin-right rounded-full bg-brand-mustard px-5 py-3 text-base font-bold text-brand-charcoal shadow-shell transition-transform duration-300 ease-out hover:opacity-90 sm:scale-100 sm:px-4 sm:py-1.5 sm:text-sm sm:shadow-none ${
              scrolled ? "scale-100" : "scale-90"
            }`}
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
