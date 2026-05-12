"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_BOTTOM_NAV, isItemActive } from "./nav-config";

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-3 z-30 flex items-center justify-between gap-1 rounded-full bg-[color:var(--color-shell-bg)] px-2 py-2 shadow-[var(--shadow-shell)]"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      {MOBILE_BOTTOM_NAV.map((item) => {
        const active = isItemActive(pathname, item);
        const Icon = item.icon;
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
