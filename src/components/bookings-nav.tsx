"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const MANAGE = [
  { label: "Overview", href: "/bookings/overview" },
  { label: "Calendar", href: "/bookings/calendar" },
  { label: "Waitlist", href: "/bookings/waitlist" },
];

const SETUP = [
  { label: "Booking Settings", href: "/bookings/settings" },
  { label: "Booking Form", href: "/bookings/booking-form" },
];

function isSetupPath(pathname: string) {
  return SETUP.some((item) => pathname.startsWith(item.href));
}

export default function BookingsNav() {
  const pathname = usePathname();
  const defaultCluster = isSetupPath(pathname) ? "setup" : "manage";
  const [cluster, setCluster] = useState<"manage" | "setup">(defaultCluster);

  const activeCluster = cluster === "manage" ? MANAGE : SETUP;

  function linkClass(href: string) {
    const active = pathname.startsWith(href);
    return `text-sm transition-colors ${
      active
        ? "text-foreground font-medium"
        : "text-muted-foreground hover:text-foreground"
    }`;
  }

  return (
    <div className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6">
        {/* Desktop: two clusters with divider */}
        <div className="hidden md:flex items-center h-10 gap-5">
          {MANAGE.map(({ label, href }) => (
            <Link key={href} href={href} className={linkClass(href)}>
              {label}
            </Link>
          ))}

          <span className="w-px h-4 bg-border shrink-0" />

          {SETUP.map(({ label, href }) => (
            <Link key={href} href={href} className={linkClass(href)}>
              {label}
            </Link>
          ))}
        </div>

        {/* Mobile: Manage / Setup segmented switch + active cluster links */}
        <div className="md:hidden space-y-2 py-2.5">
          <div className="flex rounded-md border border-border overflow-hidden w-fit">
            {(["manage", "setup"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCluster(c)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  cluster === c
                    ? "bg-brand-mustard text-brand-charcoal"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c === "manage" ? "Manage" : "Setup"}
              </button>
            ))}
          </div>

          <div className="flex gap-5 overflow-x-auto pb-0.5">
            {activeCluster.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className={`shrink-0 py-1 ${linkClass(href)}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
