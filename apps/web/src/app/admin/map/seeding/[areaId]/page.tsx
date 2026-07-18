import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import {
  areaBucketCapacity,
  braveUsageSummary,
  getSeedArea,
  listAreaCandidates,
} from "@/lib/server/map-seeding";
import { SEED_CAP_PER_BUCKET } from "@inklee/shared/map-directory";
import {
  SEED_COUNTRY_CODES,
  getSeedCountry,
} from "@inklee/shared/seed-countries";
import { isAutomatedSeedImportEnabled } from "@/lib/features";
import { listCountryRuns } from "@/lib/server/seed-automation";
import SeedLanes from "./seed-lanes";
import CandidateQueue from "./candidate-queue";
import AreaStatus from "./area-status";
import AutomatedLane from "./automated-lane";

export const metadata = { title: "Admin · Seed area" };

export default async function AdminSeedAreaPage({
  params,
}: {
  params: Promise<{ areaId: string }>;
}) {
  await requireAdmin();
  const { areaId } = await params;
  const area = await getSeedArea(areaId);
  if (!area) notFound();

  const automatedEnabled = isAutomatedSeedImportEnabled();
  const [capacity, candidates, usage, countryRuns] = await Promise.all([
    areaBucketCapacity(area, SEED_CAP_PER_BUCKET),
    listAreaCandidates(areaId),
    braveUsageSummary(),
    automatedEnabled ? listCountryRuns(areaId) : Promise.resolve([]),
  ]);

  const fullBuckets = capacity.buckets.filter(
    (b) => b.seeded >= SEED_CAP_PER_BUCKET,
  ).length;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>{" "}
          /{" "}
          <Link href="/admin/map/seeding" className="hover:text-foreground">
            Seeding
          </Link>{" "}
          / {area.label}
        </p>
        <h1 className="text-xl font-semibold text-foreground">{area.label}</h1>
        <p className="text-sm text-muted-foreground">
          {[area.city, area.country].filter(Boolean).join(", ") || "No city"} ·
          radius {area.radiusKm} km
        </p>
        <div className="mt-2">
          <AreaStatus areaId={areaId} status={area.status} />
        </div>
      </div>

      <section className="rounded-2xl border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">
          Density capacity
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {capacity.totalSeeded} seeded entries inside this area.{" "}
          {capacity.buckets.length > 0
            ? `${capacity.buckets.length} bucket${capacity.buckets.length === 1 ? "" : "s"} in use, ${fullBuckets} full (cap ${SEED_CAP_PER_BUCKET} per bucket).`
            : `No seeded entries yet; every bucket has ${SEED_CAP_PER_BUCKET} slots.`}{" "}
          The cap is enforced at conversion, never here.
        </p>
        {capacity.buckets.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {capacity.buckets.map((b) => (
              <li
                key={b.bucket}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  b.seeded >= b.cap
                    ? "bg-brand-red/15 text-brand-red"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {b.bucket}: {b.seeded}/{b.cap}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <SeedLanes
        areaId={areaId}
        braveConfigured={usage.configured}
        braveUsedToday={usage.usedToday}
        braveDailyCap={usage.dailyCap}
        braveUsedThisMonth={usage.usedThisMonth}
        braveMonthlyCap={usage.monthlyCap}
      />

      {automatedEnabled ? (
        <AutomatedLane
          areaId={areaId}
          countries={SEED_COUNTRY_CODES.map((code) => {
            const c = getSeedCountry(code);
            return { code, name: c?.name ?? code };
          })}
          runs={countryRuns}
        />
      ) : null}

      <CandidateQueue areaId={areaId} candidates={candidates} />
    </main>
  );
}
