"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Floating two-pill nav shared across all redesigned marketing pages.
 *  Logo pill top-left, nav + CTA pill top-right, both on the same
 *  container-marketing grid so they align with the body content's
 *  left/right margins.
 *
 *  Mobile-only scroll affordance: once the visitor scrolls past
 *  SCROLL_THRESHOLD pixels, the mustard "Get started" button grows a
 *  touch. Small focus-pull without redesigning the whole nav. On
 *  desktop the button stays its default size at all scroll positions
 *  (sm: prefixes lock the size back). */

const SCROLL_THRESHOLD = 60;

export default function PillNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // capture initial state if page loads scrolled
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="pointer-events-none sticky top-4 z-50">
      <div className="container-marketing flex items-center justify-between gap-3">
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
        <nav className="pointer-events-auto flex items-center gap-1 rounded-full border-[1.5px] border-shell-border bg-brand-charcoal/95 p-1.5 shadow-shell backdrop-blur">
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
          {/* Get started CTA. Mobile-only scroll-grown state — past
              60px scroll the button scales up via CSS transform.
              origin-right anchors the scale to the right edge of the
              pill so the button grows inward instead of pushing the
              pill's right edge off-screen. sm:scale-100 locks the
              scale back to 1 on desktop so the effect is mobile-only. */}
          <Link
            href="/signup"
            className={`origin-right rounded-full bg-brand-mustard px-4 py-1.5 text-sm font-bold text-brand-charcoal transition-transform duration-300 ease-out hover:opacity-90 sm:scale-100 ${
              scrolled ? "scale-[1.18]" : "scale-100"
            }`}
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
