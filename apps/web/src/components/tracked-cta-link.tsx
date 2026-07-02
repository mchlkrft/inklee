"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackEvent } from "@/lib/track";

/**
 * A next/link that reports a `marketing_cta_click` Plausible event on click.
 * Used on the important account-creation CTAs (hero, final section, feature
 * pages, guides) — not on every navigation link. `cta` is a stable position
 * identifier ("hero-signup", "final-signup", "nav-get-started"); the page path
 * is attached automatically by trackEvent as current_path.
 */
export default function TrackedCtaLink({
  cta,
  href,
  className,
  children,
  ...rest
}: {
  cta: string;
  href: string;
  className?: string;
  children: ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => trackEvent("marketing_cta_click", { cta })}
      {...rest}
    >
      {children}
    </Link>
  );
}
