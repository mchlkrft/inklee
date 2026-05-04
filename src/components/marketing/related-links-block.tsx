import Link from "next/link";
import type { RelatedLink } from "@/lib/marketing";

type RelatedLinksBlockProps = {
  heading: string;
  intro?: string;
  links: RelatedLink[];
};

export default function RelatedLinksBlock({
  heading,
  intro,
  links,
}: RelatedLinksBlockProps) {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 md:py-24">
      <div className="max-w-xl">
        <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
          {heading}
        </h2>
        {intro && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {intro}
          </p>
        )}
      </div>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex flex-col justify-between rounded-xl border border-border p-6 transition-colors hover:border-foreground"
          >
            <div>
              {link.eyebrow && (
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {link.eyebrow}
                </p>
              )}
              <p className="mt-2 text-lg font-semibold text-foreground">
                {link.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {link.description}
              </p>
            </div>
            <span className="mt-6 text-sm text-muted-foreground transition-colors group-hover:text-foreground">
              Read more →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
