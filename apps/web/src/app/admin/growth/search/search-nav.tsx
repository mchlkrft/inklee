import Link from "next/link";

export type SearchNavKey = "overview" | "queries" | "pages" | "organic";

const ITEMS: { key: SearchNavKey; label: string; href: string }[] = [
  { key: "overview", label: "Overview", href: "/admin/growth/search" },
  { key: "queries", label: "Queries", href: "/admin/growth/search/queries" },
  { key: "pages", label: "Pages", href: "/admin/growth/search/pages" },
  {
    key: "organic",
    label: "Organic landing pages",
    href: "/admin/growth/search/organic",
  },
];

/**
 * Pill sub-nav for the Search Console section group. Server component: pages
 * pass their resolved searchParams so links carry the selected range
 * (?range/?from/?to) across sub-pages. One-shot flags (?gsc=) are dropped on
 * purpose so OAuth notices do not follow the admin around.
 */
export default function SearchNav({
  active,
  params = {},
}: {
  active: SearchNavKey;
  params?: { range?: string; from?: string; to?: string };
}) {
  const carried = new URLSearchParams();
  if (params.range) carried.set("range", params.range);
  if (params.from) carried.set("from", params.from);
  if (params.to) carried.set("to", params.to);
  const suffix = carried.toString();

  return (
    <nav
      aria-label="Search Console sections"
      className="flex flex-wrap items-center gap-1"
    >
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={suffix ? `${item.href}?${suffix}` : item.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              isActive
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
