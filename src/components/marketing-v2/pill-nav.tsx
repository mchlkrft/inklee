import Link from "next/link";

/** Floating two-pill nav shared across all redesigned marketing pages.
 *
 *  Mobile layout: logo pill (left) + mustard "Get started" FAB (right).
 *  The right nav container is a transparent flex wrapper on mobile —
 *  the FAB itself IS the pill, sized to match the logo pill at
 *  body-button height (px-5 py-3 text-base).
 *
 *  Desktop layout (sm+): the right pill becomes a multi-button container
 *  with App / About / Log in / Get started inside. The FAB shrinks to
 *  nav-link sizing via sm:* overrides.
 *
 *  Mobile scroll affordance: the FAB starts visibly smaller (CSS default)
 *  and grows to full size once the visitor scrolls past 60px. Driven by
 *  `html[data-scrolled]`, set by the scroll-state script in
 *  `src/app/layout.tsx` — placed there (not here) so the listener survives
 *  client-side navigation between marketing pages. */

export default function PillNav() {
  return (
    <header className="pointer-events-none sticky top-4 z-50">
      <div className="container-marketing flex items-center justify-between gap-3">
        {/* Logo pill — body-button height (px-5 py-3). data-nav-logo hooks it
            into the same mobile scroll-grow rule as the FAB so both pills
            stay balanced (same scale, same final height). */}
        <Link
          href="/"
          aria-label="Inklee home"
          data-nav-logo=""
          className="pointer-events-auto inline-flex items-center rounded-full border-[1.5px] border-shell-border bg-brand-charcoal/95 px-5 py-3 shadow-shell backdrop-blur transition-all duration-300 ease-out hover:bg-brand-charcoal"
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

        {/* Right nav. On mobile: transparent flex container, FAB is
            the pill. On desktop: full pill treatment with multi-button
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
          {/* FAB. data-fab-cta is the hook that globals.css uses to
              scale the button down when html[data-scrolled="0"] on
              mobile. Without the attribute the button stays at its
              default size on every breakpoint. */}
          <Link
            href="/signup"
            data-fab-cta=""
            className="rounded-full bg-brand-mustard px-5 py-3 text-base font-bold text-brand-charcoal shadow-shell transition-transform duration-300 ease-out hover:opacity-90 sm:px-5 sm:py-1.5 sm:text-sm sm:shadow-none"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
