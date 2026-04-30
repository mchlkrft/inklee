"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { label: "Flash Items", href: "/flash/items" },
  { label: "Flash Days", href: "/flash/days" },
  { label: "Instagram", href: "/flash/instagram" },
];

export default function FlashNav() {
  const pathname = usePathname();

  function linkClass(href: string) {
    const active = pathname.startsWith(href);
    return `text-sm transition-colors ${
      active
        ? "text-foreground font-medium"
        : "text-muted-foreground hover:text-foreground"
    }`;
  }

  return (
    <div className="sticky top-12 md:top-14 z-10 border-b border-border bg-background">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex items-center h-11 gap-5 overflow-x-auto">
          {ITEMS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={`shrink-0 ${linkClass(href)}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
