"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SETTINGS_NAV = [
  { label: "Profile", href: "/settings/profile" },
  { label: "Emails", href: "/settings/emails" },
  { label: "Calendar", href: "/settings/calendar" },
  { label: "Dashboard", href: "/settings/dashboard" },
  { label: "Account", href: "/settings/account" },
];

export default function SettingsNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-12 md:top-14 z-10 border-b border-border bg-background">
      <div className="mx-auto max-w-5xl px-6">
        <div className="flex items-center gap-1 h-11 overflow-x-auto">
          {SETTINGS_NAV.map(({ label, href }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`shrink-0 text-sm transition-colors px-2 py-2 border-b-2 ${
                  active
                    ? "border-brand-mustard text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
