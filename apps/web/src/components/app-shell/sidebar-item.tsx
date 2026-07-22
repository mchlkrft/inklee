"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";

interface SidebarItemProps {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  badgeCount?: number;
  // Icon-only variant (the map's floating rail). The icon keeps its normal
  // left position so switching between the full sidebar and the collapsed rail
  // is seamless; the label + badge are hidden and the label moves to a tooltip.
  collapsed?: boolean;
}

export default function SidebarItem({
  href,
  label,
  Icon,
  active,
  badgeCount,
  collapsed,
}: SidebarItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-rosa/50 ${
        active
          ? "text-brand-rosa"
          : "text-[color:var(--color-shell-fg-dim)] hover:text-brand-bone hover:bg-[color:var(--color-shell-hover-strong)]"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-rosa"
        />
      )}
      <Icon
        className="h-[18px] w-[18px] shrink-0"
        strokeWidth={active ? 2 : 1.6}
      />
      {!collapsed && (
        <span className={active ? "font-medium" : ""}>{label}</span>
      )}
      {!collapsed && typeof badgeCount === "number" && badgeCount > 0 && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-mustard px-1.5 text-[11px] font-semibold leading-none text-brand-charcoal">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
    </Link>
  );
}
