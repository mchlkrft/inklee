"use client";

import Link from "next/link";
import { useState } from "react";
import { LogOut, ExternalLink, User } from "lucide-react";
import { logoutAction } from "@/app/(auth)/signup/actions";

interface SidebarAccountProps {
  slug: string;
  displayName: string;
}

export default function SidebarAccount({
  slug,
  displayName,
}: SidebarAccountProps) {
  const [open, setOpen] = useState(false);
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[color:var(--color-shell-hover)]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-rosa text-sm font-semibold text-brand-charcoal">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-brand-bone">
            {displayName}
          </span>
          <span className="block truncate text-xs text-[color:var(--color-shell-fg-mute)]">
            inklee.app/{slug}
          </span>
        </span>
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
            className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-xl border border-[color:var(--color-shell-border)] bg-[color:var(--color-shell-bg)] py-1 shadow-[var(--shadow-shell)]"
          >
            <Link
              href="/settings/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-brand-bone transition-colors hover:bg-[color:var(--color-shell-hover)]"
              role="menuitem"
            >
              <User className="h-4 w-4" strokeWidth={1.6} /> Edit profile
            </Link>
            <Link
              href={`/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--color-shell-fg-dim)] transition-colors hover:bg-[color:var(--color-shell-hover)] hover:text-brand-bone"
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
              className="flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--color-shell-fg-dim)] transition-colors hover:bg-[color:var(--color-shell-hover)] hover:text-brand-bone"
              role="menuitem"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.6} /> View flash
              page
            </Link>
            <div className="my-1 h-px bg-[color:var(--color-shell-border)]" />
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--color-shell-fg-dim)] transition-colors hover:bg-[color:var(--color-shell-hover)] hover:text-brand-bone"
                role="menuitem"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.6} /> Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
