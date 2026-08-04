import { requireAdmin } from "@/lib/admin-guard";
import { serviceClient } from "@/lib/supabase/service";
import ContentReportsClient, {
  type ContentReportRow,
} from "./content-reports-client";

export const metadata = { title: "Admin · Content reports" };

// Founder-scale queue: load the latest reports and review client-side, matching
// the admin/map and support-inbox pattern (no server pagination in admin).
const LIMIT = 500;

export default async function AdminContentReportsPage() {
  await requireAdmin();

  const { data } = await serviceClient
    .from("content_reports")
    .select(
      "id, category, url, description, reporter_name, reporter_email, reference, status, target_artist_id, statement_of_reasons_id, reviewed_at, created_at",
    )
    // Unresolved first (new/reviewed before actioned/dismissed), then newest.
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  return <ContentReportsClient rows={(data ?? []) as ContentReportRow[]} />;
}
