"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SectionNavItem {
  label: string;
  href: string;
  match?: string[];
}

export function isActiveItem(pathname: string, item: SectionNavItem): boolean {
  if (pathname === item.href) return true;
  if (pathname.startsWith(item.href + "/")) return true;
  if (item.match) {
    for (const prefix of item.match) {
      if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
    }
  }
  return false;
}

/**
 * Section-level sub-navigation. Tabbed strip with a mustard underline on
 * the active item. Horizontally scrollable on narrow viewports.
 *
 * The active underline is rendered as an absolutely-positioned span sitting
 * exactly on top of the container's `border-b` — avoids the sub-pixel
 * alignment issues of negative-margin overlap with 1.5px borders.
 */
export default function SectionNav({ items }: { items: SectionNavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="relative border-b border-border">
      <div className="flex h-11 items-center gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = isActiveItem(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative shrink-0 h-full inline-flex items-center px-3 text-sm transition-colors ${
                active
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 -bottom-[1.5px] h-[1.5px] bg-brand-mustard"
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
