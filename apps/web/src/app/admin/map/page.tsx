import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { serviceClient } from "@/lib/supabase/service";
import MapDirectoryClient, { type DirectoryRow } from "./map-directory-client";

export const metadata = { title: "Admin · Map directory" };

// Founder-scale directory: load the latest entries and filter client-side,
// matching the support-inbox pattern (no server pagination exists in admin).
const DIRECTORY_LIMIT = 500;

export default async function AdminMapPage() {
  await requireAdmin();

  const [
    { data: locationData },
    { count: newReports },
    { count: openDuplicates },
    { count: pendingClaims },
  ] = await Promise.all([
    serviceClient
      .from("map_locations")
      .select(
        "id, source, category, name, city, country, claim_status, moderation_status, is_seed, seed_region_bucket, created_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(DIRECTORY_LIMIT),
    serviceClient
      .from("map_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    serviceClient
      .from("map_duplicate_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    serviceClient
      .from("location_claims")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const rows = (locationData ?? []) as DirectoryRow[];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>{" "}
            / Map directory
          </p>
          <h1 className="text-xl font-semibold text-foreground">
            Tattoo map directory
          </h1>
          <p className="text-sm text-muted-foreground">
            Admin-curated studios and shops for the Inklee 2.0 map. Seeded
            entries are capped at 5 per 300 square km area.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/map/claims"
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
          >
            Claims{(pendingClaims ?? 0) > 0 ? ` (${pendingClaims})` : ""}
          </Link>
          <Link
            href="/admin/map/duplicates"
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
          >
            Duplicates{(openDuplicates ?? 0) > 0 ? ` (${openDuplicates})` : ""}
          </Link>
          <Link
            href="/admin/map/reports"
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
          >
            Reports{(newReports ?? 0) > 0 ? ` (${newReports} new)` : ""}
          </Link>
          <Link
            href="/admin/map/seeding"
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/30"
          >
            Seeding
          </Link>
          <Link
            href="/admin/map/new"
            className="rounded-md bg-foreground px-3 py-2 text-sm text-background transition-colors hover:opacity-90"
          >
            Add location
          </Link>
        </div>
      </div>
      <MapDirectoryClient rows={rows} limit={DIRECTORY_LIMIT} />
    </main>
  );
}
