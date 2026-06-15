"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import RandomizedLogo from "@/components/randomized-logo";
import NotificationBell from "@/components/notification-bell";
import { logoutAction } from "@/app/(auth)/signup/actions";

interface MobileTopBarProps {
  slug: string;
  displayName: string;
  unreadCount: number;
  /** Books-status pill, same component as the desktop top bar but compact. */
  statusPill?: ReactNode;
}

/**
 * Floating dark pill at the top of every mobile artist screen.
 *
 * Redesigned 2026-05-25 from a flush sticky bar to a floating rounded-full
 * pill that mirrors the bottom nav's visual language (fixed inset-x-3,
 * shell-bg, shadow-shell). Gives the chrome more breathing room and
 * matches the reference dark-pill pattern. Account menu collapsed from
 * "displayName ▾" text to an icon-only hamburger to keep the inner row
 * uncluttered alongside the status pill and notification bell.
 *
 * Parent `<main>` carries `pt-20` on mobile to clear the floating pill.
 */
export default function MobileTopBar({
  slug,
  displayName,
  unreadCount,
  statusPill,
}: MobileTopBarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Hide all app chrome during onboarding to keep the wizard focused.
  if (pathname.startsWith("/onboarding")) return null;

  return (
    <header
      aria-label="Account"
      className="md:hidden fixed inset-x-3 z-20 flex h-14 items-center justify-between gap-2 rounded-full bg-[color:var(--color-shell-bg)] px-3 shadow-[var(--shadow-shell)]"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      <Link
        href="/dashboard"
        aria-label="inklee — go to dashboard"
        className="flex shrink-0 items-center pl-1"
      >
        <RandomizedLogo height={22} />
      </Link>

      <div className="flex items-center gap-1.5">
        {statusPill}
        <NotificationBell initialUnreadCount={unreadCount} />
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`Account menu for ${displayName}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-workspace-border)] bg-[color:var(--color-workspace-card)] text-[color:var(--color-workspace-fg)] transition-colors hover:border-transparent hover:bg-brand-charcoal hover:text-brand-bone focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-rosa/50"
          >
            <Menu className="h-4 w-4" />
          </button>

          {open && (
            <>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setOpen(false)}
              />
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-background py-1 shadow-lg"
              >
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {displayName}
                  </p>
                </div>
                <Link
                  href="/settings/profile"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/50"
                  role="menuitem"
                >
                  Settings
                </Link>
                <Link
                  href={`/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  role="menuitem"
                >
                  View booking form ↗
                </Link>
                <Link
                  href={`/${slug}/flash`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  role="menuitem"
                >
                  View flash page ↗
                </Link>
                <div className="my-1 h-px bg-border" />
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="block w-full px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    role="menuitem"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
