import Link from "next/link";
import SiteLogo from "@/components/site-logo";
import { getRenderableFooterGroups } from "@/lib/footer-links";

// FU-9: the md column count must track the rendered sections (1 brand column
// + N link groups) or the last group wraps to an orphan row. Static class
// strings because Tailwind can't see dynamically composed names.
const MD_GRID_COLS: Record<number, string> = {
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
  6: "md:grid-cols-6",
};

/** Shared site footer across all redesigned marketing pages. Inherits
 *  the trimmed Legal group from src/lib/footer-links.ts (Imprint /
 *  Privacy / Terms only — DPA / Acceptable Use / Cookies /
 *  Subprocessors / Report content stay linked from inside the legal
 *  pages themselves). */
export default function SiteFooter() {
  const groups = getRenderableFooterGroups();
  const mdCols = MD_GRID_COLS[groups.length + 1] ?? "md:grid-cols-6";
  return (
    <footer className="border-t border-border">
      <div className="container-marketing py-12">
        <div className={`grid grid-cols-2 gap-8 ${mdCols}`}>
          <div className="col-span-2 md:col-span-1">
            <SiteLogo height={16} />
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Booking tools for freelance and
              <br />
              traveling tattoo artists.
            </p>
          </div>
          {groups.map((group) => (
            <div key={group.id}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-3 space-y-2">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      {...(item.external && {
                        target: "_blank",
                        rel: "noopener noreferrer",
                      })}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Inklee. All rights reserved.</span>
          <span className="opacity-40">Made for the ink.</span>
        </div>
      </div>
    </footer>
  );
}
