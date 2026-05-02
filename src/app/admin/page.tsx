import { requireAdmin } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import {
  getKpis,
  getOnboardingFunnel,
  getBookingFunnel,
  getFeatureAdoption,
  getQualitySignals,
  getArtistRoster,
  getIntegrityFlags,
  type DateRange,
} from "@/lib/admin-queries";
import AdminClient from "./admin-client";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const adminId = await requireAdmin();

  void writeAudit({
    action: "admin_page_accessed",
    actor: adminId,
    category: "admin",
  });

  const { range: rawRange = "30" } = await searchParams;
  const range = (
    ["7", "30", "90", "all"].includes(rawRange) ? rawRange : "30"
  ) as DateRange;

  const [
    kpis,
    onboardingFunnel,
    bookingFunnel,
    featureAdoption,
    quality,
    artists,
    integrity,
  ] = await Promise.all([
    getKpis(range),
    getOnboardingFunnel(range),
    getBookingFunnel(range),
    getFeatureAdoption(),
    getQualitySignals(),
    getArtistRoster(),
    getIntegrityFlags(),
  ]);

  return (
    <AdminClient
      range={range}
      kpis={kpis}
      onboardingFunnel={onboardingFunnel}
      bookingFunnel={bookingFunnel}
      featureAdoption={featureAdoption}
      quality={quality}
      artists={artists}
      integrity={integrity}
    />
  );
}
