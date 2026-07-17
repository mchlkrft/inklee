import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { serviceClient } from "@/lib/supabase/service";
import ReportsQueue, { type ReportRow } from "./reports-queue";

export const metadata = { title: "Admin · Map reports" };

const QUEUE_LIMIT = 200;

export default async function AdminMapReportsPage() {
  await requireAdmin();

  const { data: reportData } = await serviceClient
    .from("map_reports")
    .select(
      "id, target_type, target_artist_id, target_map_location_id, reason, detail, status, created_at, reviewed_at",
    )
    .order("created_at", { ascending: false })
    .limit(QUEUE_LIMIT);
  const reports = (reportData ?? []) as Array<{
    id: string;
    target_type: string;
    target_artist_id: string | null;
    target_map_location_id: string | null;
    reason: string;
    detail: string | null;
    status: string;
    created_at: string;
    reviewed_at: string | null;
  }>;

  // Resolve target names once per unique id (support-inbox pattern).
  const locationIds = [
    ...new Set(
      reports.map((r) => r.target_map_location_id).filter(Boolean) as string[],
    ),
  ];
  const artistIds = [
    ...new Set(
      reports.map((r) => r.target_artist_id).filter(Boolean) as string[],
    ),
  ];
  const [{ data: locationData }, { data: profileData }] = await Promise.all([
    locationIds.length
      ? serviceClient
          .from("map_locations")
          .select("id, name, city")
          .in("id", locationIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    artistIds.length
      ? serviceClient
          .from("profiles")
          .select("id, display_name, slug")
          .in("id", artistIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const locationNames = new Map(
    (locationData ?? []).map((l) => [
      l.id as string,
      [l.name, l.city].filter(Boolean).join(", "),
    ]),
  );
  const artistNames = new Map(
    (profileData ?? []).map((p) => [
      p.id as string,
      ((p.display_name as string | null) || (p.slug as string | null)) ??
        "Unknown artist",
    ]),
  );

  const rows: ReportRow[] = reports.map((r) => ({
    id: r.id,
    targetLabel: r.target_map_location_id
      ? (locationNames.get(r.target_map_location_id) ?? "Removed location")
      : r.target_artist_id
        ? (artistNames.get(r.target_artist_id) ?? "Deleted artist")
        : "Unknown target",
    targetType: r.target_type,
    reason: r.reason,
    detail: r.detail,
    status: r.status,
    createdAt: r.created_at,
  }));

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
          / Reports
        </p>
        <h1 className="text-xl font-semibold text-foreground">Map reports</h1>
        <p className="text-sm text-muted-foreground">
          Reports are anonymous toward the target, never toward the platform. We
          try to keep the map as clean as possible; not every report gets a
          resolution. Records are kept 24 months (DSA register).
        </p>
      </div>
      <ReportsQueue rows={rows} />
    </main>
  );
}
