"use client";

import Link from "next/link";
import { useState } from "react";
import RandomizedLogo from "@/components/randomized-logo";
import NotificationBell from "@/components/notification-bell";
import { logoutAction } from "@/app/(auth)/signup/actions";

interface MobileTopBarProps {
  slug: string;
  displayName: string;
  unreadCount: number;
}

export default function MobileTopBar({
  slug,
  displayName,
  unreadCount,
}: MobileTopBarProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="md:hidden sticky top-0 z-20 bg-[color:var(--color-workspace-bg)]">
      <div className="flex h-12 items-center justify-between px-4">
        <Link href="/dashboard" aria-label="inklee — go to dashboard">
          <RandomizedLogo height={20} />
        </Link>

        <div className="flex items-center gap-1">
          <NotificationBell initialUnreadCount={unreadCount} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-md px-2 py-1.5 text-sm text-[color:var(--color-workspace-fg-dim)] transition-colors hover:text-foreground"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              {displayName} <span className="opacity-60">▾</span>
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
                  className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-background py-1 shadow-lg"
                >
                  <Link
                    href="/settings/profile"
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/50"
                    role="menuitem"
                  >
                    Edit profile
                  </Link>
                  <Link
                    href={`/${slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    role="menuitem"
                  >
                    View public page ↗
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
      </div>
    </header>
  );
}
