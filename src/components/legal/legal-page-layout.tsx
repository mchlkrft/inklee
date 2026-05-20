import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { LegalDoc } from "@/lib/legal/documents";

// Live legal routes only. /cookies and /acceptable-use land as they ship;
// keep this in sync with the Legal group in src/lib/footer-links.ts.
const LEGAL_FOOTER_LINKS: { label: string; href: string }[] = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Imprint", href: "/imprint" },
  { label: "DPA", href: "/dpa" },
  { label: "Acceptable Use", href: "/acceptable-use" },
];

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h2 className="mt-8 text-base font-medium text-foreground">{children}</h2>
  ),
  h2: ({ children }) => (
    <h2 className="mt-8 text-base font-medium text-foreground">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 text-base font-medium text-foreground">{children}</h3>
  ),
  h4: ({ children }) => (
    <h3 className="mt-6 text-base font-medium text-foreground">{children}</h3>
  ),
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-foreground underline underline-offset-4"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-medium text-foreground">{children}</strong>
  ),
  code: ({ children }) => <code className="text-foreground">{children}</code>,
  hr: () => <hr className="my-6 border-border" />,
};

export function LegalPageLayout({ doc }: { doc: LegalDoc }) {
  // Show the "draft pending legal review" footnote when EITHER:
  // - the doc has a per-page override forcing it on (used when this specific
  //   doc isn't counsel-cleared yet while others are), OR
  // - the global env flag isn't explicitly "false" (default-on; counsel sets
  //   `NEXT_PUBLIC_LEGAL_PENDING_REVIEW=false` after broad sign-off).
  const pendingReview =
    doc.pendingReview === true ||
    process.env.NEXT_PUBLIC_LEGAL_PENDING_REVIEW !== "false";

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex-1 w-full max-w-2xl space-y-8 px-6 py-12">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight text-foreground"
        >
          inklee
        </Link>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">
              {doc.title}
            </h1>
            <p className="text-xs">Last updated: {doc.lastUpdated}</p>
          </div>

          {pendingReview && (
            <p className="rounded-md border border-border px-3 py-2 text-xs">
              This document is a draft pending legal review. It is not final or
              counsel-approved and may change before launch.
            </p>
          )}

          <div className="space-y-4">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {doc.body}
            </ReactMarkdown>
          </div>

          <footer className="space-y-3 border-t border-border pt-6 text-xs">
            <nav className="flex flex-wrap gap-x-4 gap-y-2">
              {LEGAL_FOOTER_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-foreground underline underline-offset-4"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <p>
              Version {doc.version} · ref {doc.versionHash.slice(0, 12)}
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
