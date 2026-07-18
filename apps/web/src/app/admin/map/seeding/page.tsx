import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { braveUsageSummary, listSeedAreas } from "@/lib/server/map-seeding";
import {
  SEED_AREA_STATUS_LABELS,
  type SeedAreaStatus,
} from "@inklee/shared/map-seeding";
import AreaForm from "./area-form";

export const metadata = { title: "Admin · Map seeding" };

export default async function AdminSeedingPage() {
  await requireAdmin();
  const [areas, usage] = await Promise.all([
    listSeedAreas(),
    braveUsageSummary(),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>{" "}
          /{" "}
          <Link href="/admin/map" className="hover:text-foreground">
            Map directory
          </Link>{" "}
          / Seeding
        </p>
        <h1 className="text-xl font-semibold text-foreground">Map seeding</h1>
        <p className="text-sm text-muted-foreground">
          Lead collector for the first map seed. Sources create candidates; only
          review and conversion create map entries. The 5 per 300 square km cap
          fires at conversion.
        </p>
        <p className="mt-1 text-sm">
          <Link
            href="/admin/map/seeding/coverage"
            className="text-foreground underline"
          >
            Country coverage
          </Link>{" "}
          <span className="text-muted-foreground">
            runs whole-country discovery automatically.
          </span>
        </p>
      </div>

      <section className="rounded-2xl border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">Brave search</h2>
        {usage.configured ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {usage.usedToday}/{usage.dailyCap} today · {usage.usedThisMonth}/
            {usage.monthlyCap} this month. Hard stop before the monthly credit;
            blocked requests are logged.
            {usage.lastBlockedReason ? (
              <span className="block text-brand-red">
                Last block: {usage.lastBlockedReason}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Not configured. Set MAP_SEED_BRAVE_SEARCH_KEY to enable the lane.
          </p>
        )}
      </section>

      {areas.length > 0 ? (
        <ul className="space-y-2">
          {areas.map((a) => {
            const total = Object.values(a.candidateCounts).reduce(
              (sum, n) => sum + n,
              0,
            );
            const open =
              (a.candidateCounts.new ?? 0) +
              (a.candidateCounts.likely_duplicate ?? 0) +
              (a.candidateCounts.approved_for_enrichment ?? 0);
            return (
              <li key={a.id}>
                <Link
                  href={`/admin/map/seeding/${a.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-4 transition-colors hover:bg-muted/30"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">
                      {a.label}
                      {a.city ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {a.city}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {total} candidates · {open} open ·{" "}
                      {a.candidateCounts.converted ?? 0} converted
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      a.status === "active"
                        ? "bg-brand-mustard/20 text-brand-mustard"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {SEED_AREA_STATUS_LABELS[a.status as SeedAreaStatus] ??
                      a.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No seed areas yet. Create one per city you want to work.
        </p>
      )}

      <AreaForm />
    </main>
  );
}
