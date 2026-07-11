import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Pill sub-nav for the acquisition section group. Server component: the
 * current page passes its own key and a prebuilt range suffix, so no client
 * hooks are needed and the selected date range survives navigation.
 */

const ITEMS = [
  { key: "overview", label: "Overview", href: "/admin/growth/acquisition" },
  { key: "pages", label: "Pages", href: "/admin/growth/acquisition/pages" },
  {
    key: "sources",
    label: "Sources and campaigns",
    href: "/admin/growth/acquisition/sources",
  },
  {
    key: "conversions",
    label: "Conversions",
    href: "/admin/growth/acquisition/conversions",
  },
  {
    key: "attribution",
    label: "Signup attribution",
    href: "/admin/growth/acquisition/attribution",
  },
] as const;

/** Build the "?range=…&from=…&to=…" suffix (or "") from the awaited
 *  searchParams, so links keep the selected window. */
export function acquisitionRangeSuffix(params: {
  range?: string;
  from?: string;
  to?: string;
}): string {
  const query = new URLSearchParams();
  if (params.range) query.set("range", params.range);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const suffix = query.toString();
  return suffix ? `?${suffix}` : "";
}

export default function AcquisitionNav({
  active,
  rangeSuffix,
}: {
  active: string;
  rangeSuffix: string;
}) {
  return (
    <nav
      aria-label="Acquisition sections"
      className="flex flex-wrap items-center gap-1"
    >
      {ITEMS.map((item) => (
        <Link
          key={item.key}
          href={`${item.href}${rangeSuffix}`}
          className={cn(
            "rounded-full px-3 py-1 text-xs transition-colors",
            active === item.key
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
