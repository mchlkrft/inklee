"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Settings as SettingsIcon,
  ExternalLink,
  LogOut,
  User,
} from "lucide-react";
import NotificationBell from "@/components/notification-bell";
import { logoutAction } from "@/app/(auth)/signup/actions";

interface WorkspaceTopBarProps {
  slug: string;
  displayName: string;
  unreadCount: number;
  statusPill: ReactNode;
}

function IconButton({
  href,
  ariaLabel,
  children,
}: {
  href: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-workspace-border)] bg-[color:var(--color-workspace-card)] text-[color:var(--color-workspace-fg)] transition-colors hover:border-transparent hover:bg-brand-charcoal hover:text-brand-bone focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-rosa/50"
    >
      {children}
    </Link>
  );
}

export default function WorkspaceTopBar({
  slug,
  displayName,
  unreadCount,
  statusPill,
}: WorkspaceTopBarProps) {
  const [open, setOpen] = useState(false);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="hidden md:flex items-center justify-end gap-2 px-8 pt-6">
      {statusPill}

      <NotificationBell initialUnreadCount={unreadCount} />

      <IconButton href="/settings/profile" ariaLabel="Settings">
        <SettingsIcon className="h-4 w-4" strokeWidth={1.6} />
      </IconButton>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-rosa text-sm font-semibold text-brand-charcoal transition-colors hover:bg-brand-charcoal hover:text-brand-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-rosa/60"
        >
          {initial}
        </button>

        {open && (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              className="fixed inset-0 z-30 cursor-default"
              onClick={() => setOpen(false)}
            />
            <div
              role="menu"
              className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-[color:var(--color-workspace-border)] bg-[color:var(--color-workspace-card)] py-1 shadow-[var(--shadow-card)]"
            >
              <div className="px-3 pb-2 pt-1.5">
                <p className="truncate text-sm font-medium text-[color:var(--color-workspace-fg)]">
                  {displayName}
                </p>
                <p className="truncate text-xs text-[color:var(--color-workspace-fg-dim)]">
                  inklee.app/{slug}
                </p>
              </div>
              <div className="my-1 h-px bg-[color:var(--color-workspace-border)]" />
              <Link
                href="/settings/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--color-workspace-fg)] transition-colors hover:bg-[color:var(--color-workspace-card-2)]"
                role="menuitem"
              >
                <User className="h-4 w-4" strokeWidth={1.6} /> Edit profile
              </Link>
              <Link
                href={`/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--color-workspace-fg-dim)] transition-colors hover:bg-[color:var(--color-workspace-card-2)] hover:text-[color:var(--color-workspace-fg)]"
                role="menuitem"
              >
                <ExternalLink className="h-4 w-4" strokeWidth={1.6} /> View
                booking form
              </Link>
              <Link
                href={`/${slug}/flash`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--color-workspace-fg-dim)] transition-colors hover:bg-[color:var(--color-workspace-card-2)] hover:text-[color:var(--color-workspace-fg)]"
                role="menuitem"
              >
                <ExternalLink className="h-4 w-4" strokeWidth={1.6} /> View
                flash page
              </Link>
              <div className="my-1 h-px bg-[color:var(--color-workspace-border)]" />
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--color-workspace-fg-dim)] transition-colors hover:bg-[color:var(--color-workspace-card-2)] hover:text-[color:var(--color-workspace-fg)]"
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.6} /> Sign out
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
