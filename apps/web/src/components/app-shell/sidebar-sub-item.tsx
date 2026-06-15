"use client";

import Link from "next/link";

interface SidebarSubItemProps {
  href: string;
  label: string;
  active: boolean;
}

export default function SidebarSubItem({
  href,
  label,
  active,
}: SidebarSubItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md py-1.5 pl-12 pr-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-rosa/50 ${
        active
          ? "text-brand-rosa font-medium"
          : "text-[color:var(--color-shell-fg-dim)] hover:text-brand-bone hover:bg-[color:var(--color-shell-hover)]"
      }`}
    >
      {label}
    </Link>
  );
}
