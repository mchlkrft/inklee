"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_BOTTOM_NAV, isItemActive } from "./nav-config";

export default function MobileBottomNav() {
  const pathname = usePathname();

  // Hide all app chrome during onboarding to keep the wizard focused.
  if (pathname.startsWith("/onboarding")) return null;

  // Middle slot gets the raised "exposed above" FAB-style treatment.
  // With 5 nav items that's index 2 (Bookings, per `MOBILE_BOTTOM_NAV`).
  const centerIndex = Math.floor(MOBILE_BOTTOM_NAV.length / 2);

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-3 z-30 flex items-end justify-between gap-1 rounded-full bg-[color:var(--color-shell-bg)] px-2 py-2 shadow-[var(--shadow-shell)]"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      {MOBILE_BOTTOM_NAV.map((item, idx) => {
        const active = isItemActive(pathname, item);
        const Icon = item.icon;
        const isCenter = idx === centerIndex;

        if (isCenter) {
          // Center FAB — larger rosa circle that pokes above the nav bar
          // via the negative margin on the circle itself. `ring-4` in the
          // shell-bg colour creates a clean cut-out where the circle
          // intersects the bar, matching the floating-button pattern.
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <span
                className={`-mt-7 flex h-14 w-14 items-center justify-center rounded-full ring-4 ring-[color:var(--color-shell-bg)] transition-colors ${
                  active
                    ? "bg-brand-mustard text-brand-charcoal"
                    : "bg-brand-rosa text-brand-charcoal"
                }`}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 2} />
              </span>
              <span
                className={`text-[11px] ${
                  active
                    ? "font-medium text-brand-rosa"
                    : "text-[color:var(--color-shell-fg-dim)]"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-full py-1.5 text-[11px] transition-colors ${
              active
                ? "bg-brand-rosa text-brand-charcoal"
                : "text-[color:var(--color-shell-fg-dim)]"
            }`}
          >
            <Icon
              className="h-[18px] w-[18px]"
              strokeWidth={active ? 2 : 1.6}
            />
            <span className={active ? "font-medium" : ""}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
