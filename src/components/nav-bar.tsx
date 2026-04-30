"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/(auth)/signup/actions";
import { useState } from "react";
import NotificationBell from "@/components/notification-bell";
import RandomizedLogo from "@/components/randomized-logo";

interface NavBarProps {
  slug: string;
  displayName: string;
  unreadCount: number;
}

const TOP_NAV = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Bookings", href: "/bookings" },
  { label: "Flash", href: "/flash" },
  { label: "Trip Planner", href: "/travel" },
  { label: "Analytics", href: "/analytics" },
  { label: "Settings", href: "/settings" },
];

const MOBILE_NAV = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Bookings", href: "/bookings" },
  { label: "Flash", href: "/flash" },
  { label: "Travel", href: "/travel" },
  { label: "Settings", href: "/settings" },
];

export default function NavBar({
  slug,
  displayName,
  unreadCount,
}: NavBarProps) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Desktop top nav */}
      <header className="sticky top-0 z-20 border-b border-border bg-background hidden md:block">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard" aria-label="inklee — go to dashboard">
            <RandomizedLogo height={22} />
          </Link>

          <nav className="flex items-center gap-1">
            {TOP_NAV.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive(href)
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Bell + Account menu */}
          <div className="flex items-center gap-1">
            <NotificationBell initialUnreadCount={unreadCount} />
            <div className="relative">
              <button
                onClick={() => setAccountOpen((v) => !v)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted/50"
              >
                <span>{displayName}</span>
                <span className="text-xs opacity-60">▾</span>
              </button>

              {accountOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setAccountOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-md border border-border bg-background shadow-lg py-1">
                    <p className="px-3 py-2 text-xs text-muted-foreground truncate">
                      {displayName}
                    </p>
                    <div className="border-t border-border my-1" />
                    <Link
                      href="/settings/profile"
                      onClick={() => setAccountOpen(false)}
                      className="block px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
                    >
                      Edit profile
                    </Link>
                    <Link
                      href={`/${slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setAccountOpen(false)}
                      className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      View public page ↗
                    </Link>
                    <div className="border-t border-border my-1" />
                    <form action={logoutAction}>
                      <button
                        type="submit"
                        className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        Sign out
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile top bar (logo + account only — nav is in bottom tabs) */}
      <header className="sticky top-0 z-20 border-b border-border bg-background md:hidden">
        <div className="px-4 h-12 flex items-center justify-between">
          <Link href="/dashboard" aria-label="inklee — go to dashboard">
            <RandomizedLogo height={20} />
          </Link>

          <div className="flex items-center gap-1">
            <NotificationBell initialUnreadCount={unreadCount} />
            <div className="relative">
              <button
                onClick={() => setAccountOpen((v) => !v)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md"
              >
                {displayName} ▾
              </button>

              {accountOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setAccountOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-md border border-border bg-background shadow-lg py-1">
                    <Link
                      href="/settings/profile"
                      onClick={() => setAccountOpen(false)}
                      className="block px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
                    >
                      Edit profile
                    </Link>
                    <Link
                      href={`/${slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setAccountOpen(false)}
                      className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      View public page ↗
                    </Link>
                    <div className="border-t border-border my-1" />
                    <form action={logoutAction}>
                      <button
                        type="submit"
                        className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        Sign out
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          // GPU compositing prevents iOS Safari visual-viewport resize wobble
          transform: "translateZ(0)",
          willChange: "transform",
        }}
      >
        <div className="grid grid-cols-5 h-[4.5rem]">
          {MOBILE_NAV.map(({ label, href }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-1.5 text-xs transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <TabIcon section={label} active={active} />
                <span className={active ? "font-semibold" : ""}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function TabIcon({ section, active }: { section: string; active: boolean }) {
  const cls = `w-6 h-6 transition-opacity ${active ? "opacity-100" : "opacity-40"}`;
  if (section === "Dashboard")
    return (
      <svg
        className={cls}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
        />
      </svg>
    );
  if (section === "Bookings")
    return (
      <svg
        className={cls}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
        />
      </svg>
    );
  if (section === "Flash")
    return (
      <svg
        className={cls}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      </svg>
    );
  if (section === "Travel")
    return (
      <svg
        className={cls}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
        />
      </svg>
    );
  // Settings
  return (
    <svg
      className={cls}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}
