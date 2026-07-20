import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";

export const metadata = {
  title: "Dev · Tools",
  robots: { index: false, follow: false },
};

// The index of internal design and diagnostic surfaces. These are not
// product features: they render candidates, previews and health checks so a
// decision can be made before code changes. Add a row whenever a new one
// lands, so nothing stays undiscoverable.
type Tool = {
  href: string;
  name: string;
  what: string;
  kind: "design" | "diagnostic" | "admin";
};

const TOOLS: Tool[] = [
  {
    href: "/dev/map-style",
    name: "Map style lab",
    what: "Tune the branded basemap and marker geometry for light and dark side by side, then copy the token block into the source.",
    kind: "design",
  },
  {
    href: "/dev/loader",
    name: "Brand loader preview",
    what: "The animated spiderweb loader at every size it ships in.",
    kind: "design",
  },
  {
    href: "/dev/ping",
    name: "Ping",
    what: "Liveness endpoint: returns ok plus the deployed commit.",
    kind: "diagnostic",
  },
  {
    href: "/admin/map/seeding",
    name: "Map seeding",
    what: "Candidate lanes, review queue and the seed density cap.",
    kind: "admin",
  },
  {
    href: "/admin/map/seeding/coverage",
    name: "Country coverage",
    what: "Autonomous country runs: progress, budgets, gaps, controls.",
    kind: "admin",
  },
  {
    href: "/admin/growth",
    name: "Growth cockpit",
    what: "First-party product and acquisition analytics.",
    kind: "admin",
  },
];

const KIND_LABEL: Record<Tool["kind"], string> = {
  design: "Design",
  diagnostic: "Diagnostic",
  admin: "Admin",
};

export default async function DevIndexPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Dev tools</h1>
        <p className="text-sm text-muted-foreground">
          Internal surfaces for design decisions and diagnostics. Nothing here
          is linked from the product.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[540px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Tool</th>
              <th className="px-4 py-2 font-medium">What it is for</th>
              <th className="px-4 py-2 font-medium">Kind</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map((tool) => (
              <tr
                key={tool.href}
                className="border-b border-border last:border-0 align-top"
              >
                <td className="px-4 py-3">
                  <Link
                    href={tool.href}
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    {tool.name}
                  </Link>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {tool.href}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{tool.what}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {KIND_LABEL[tool.kind]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
