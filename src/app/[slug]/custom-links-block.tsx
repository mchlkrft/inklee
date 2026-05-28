// Bio Page module (Slice 72) — the artist's external links (Instagram, website,
// aftercare, portfolio, etc.), managed at /settings/bio-page. URLs are already
// sanitized at save + parse time (`sanitizeBioLinkUrl`), so only http(s)/mailto
// reach here. Server component; renders null when there are no active links.

import { ExternalLink } from "lucide-react";
import type { BioCustomLink } from "@/lib/bio-page-settings";

export default function CustomLinksBlock({
  links,
}: {
  links: BioCustomLink[];
}) {
  if (links.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Links</h2>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.id}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
            >
              <span className="truncate">{link.label}</span>
              <ExternalLink
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
