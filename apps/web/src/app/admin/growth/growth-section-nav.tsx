"use client";

import { useSearchParams } from "next/navigation";
import SectionNav, { type SectionNavItem } from "@/components/section-nav";

/** Cockpit tab strip that carries the selected date range (?range/?from/?to)
 *  across tabs, so switching sections never silently resets to the default. */
export default function GrowthSectionNav({
  items,
}: {
  items: SectionNavItem[];
}) {
  const searchParams = useSearchParams();
  const carried = new URLSearchParams();
  for (const key of ["range", "from", "to"]) {
    const value = searchParams.get(key);
    if (value) carried.set(key, value);
  }
  const suffix = carried.toString();
  const withRange = suffix
    ? items.map((item) => ({ ...item, href: `${item.href}?${suffix}` }))
    : items;
  return <SectionNav items={withRange} />;
}
