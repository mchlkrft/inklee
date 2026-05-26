"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

/** Floating two-pill nav shared across all redesigned marketing pages.
 *
 *  Mobile layout: only the logo (left) and the mustard "Get started"
 *  FAB (right) are visible. The right nav container is a transparent
 *  flex wrapper on mobile — the FAB itself IS the pill, sized to match
 *  the logo pill at body-button height (px-5 py-3 text-base).
 *
 *  Desktop layout: the right pill becomes a multi-button container
 *  with App / About / Log in / Get started inside. The FAB shrinks to
 *  nav-link sizing (px-4 py-1.5 text-sm) via sm:* overrides.
 *
 *  Mobile scroll affordance: the FAB starts visibly smaller (scale
 *  0.82) and grows to full size (scale 1) once the visitor scrolls
 *  past SCROLL_THRESHOLD. Applied via INLINE STYLE so Tailwind class
 *  generation order can't break it — earlier attempts using
 *  conditional `scale-90` / `scale-100` Tailwind classes did not
 *  render visibly, suggesting a class-order conflict with the
 *  sm:scale-100 desktop lock. matchMedia gates the inline transform
 *  so it never applies on desktop, even without an sm: override. */

const SCROLL_THRESHOLD = 60;
const MOBILE_MQ = "(max-width: 639px)";

export default function PillNav() {
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // DEBUG: confirms client hydration. Remove once verified.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);

    const mql = window.matchMedia(MOBILE_MQ);
    const updateMobile = () => setIsMobile(mql.matches);
    updateMobile();
    mql.addEventListener("change", updateMobile);

    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      mql.removeEventListener("change", updateMobile);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Inline transform only when mobile AND unscrolled. Otherwise no
  // transform — desktop and mobile-scrolled both end up at scale 1.
  // Inline style overrides any Tailwind transform classes so this is
  // the most reliable path.
  const fabStyle: CSSProperties | undefined =
    isMobile && !scrolled
      ? { transform: "scale(0.82)", transformOrigin: "right center" }
      : undefined;

  return (
    <header className="pointer-events-none sticky top-4 z-50">
      {/* DEBUG: only renders post-hydration. If you see a small red
          dot bottom-right, client JS is running. Remove once verified. */}
      {mounted && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed bottom-4 right-4 z-[100] h-3 w-3 rounded-full bg-red-500 shadow-lg"
        />
      )}
      <div className="container-marketing flex items-center justify-between gap-3">
        {/* Logo pill — body-button height (px-5 py-3 baseline) */}
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

        {/* Right nav. On mobile: transparent flex container, FAB is the
            pill. On desktop: full pill treatment with multi-button
            container. */}
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
          {/* DEBUG: bg color swaps mustard↔rosa on scroll so we can
              tell at a glance whether scroll state updates at all.
              Remove this once we confirm the scroll-grow works. */}
          <Link
            href="/signup"
            style={fabStyle}
            className={`rounded-full px-5 py-3 text-base font-bold text-brand-charcoal shadow-shell transition-transform duration-300 ease-out hover:opacity-90 sm:px-4 sm:py-1.5 sm:text-sm sm:shadow-none ${
              scrolled ? "bg-brand-rosa" : "bg-brand-mustard"
            }`}
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
