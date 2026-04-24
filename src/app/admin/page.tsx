import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "michel.kraeft@gmail.com")
  .split(",")
  .map((e) => e.trim());

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    redirect("/dashboard");
  }

  void writeAudit({
    action: "admin_page_accessed",
    actor: user.id,
    category: "admin",
    details: { email: user.email },
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
