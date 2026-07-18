import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { serviceClient } from "@/lib/supabase/service";
import ClaimsQueue, { type ClaimRow } from "./claims-queue";

export const metadata = { title: "Admin · Studio claims" };

const QUEUE_LIMIT = 200;

export default async function AdminMapClaimsPage() {
  await requireAdmin();

  const { data: claimData } = await serviceClient
    .from("location_claims")
    .select(
      "id, map_location_id, claimant_user_id, claimant_role, social_link, address_confirmation, evidence_note, status, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(QUEUE_LIMIT);
  const claims = (claimData ?? []) as Array<{
    id: string;
    map_location_id: string;
    claimant_user_id: string;
    claimant_role: string;
    social_link: string;
    address_confirmation: string | null;
    evidence_note: string | null;
    status: string;
    created_at: string;
  }>;

  const locationIds = [...new Set(claims.map((c) => c.map_location_id))];
  const claimantIds = [...new Set(claims.map((c) => c.claimant_user_id))];
  const [{ data: locationData }, { data: profileData }] = await Promise.all([
    locationIds.length
      ? serviceClient
          .from("map_locations")
          .select("id, name, address, city, country, claim_status")
          .in("id", locationIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    claimantIds.length
      ? serviceClient
          .from("profiles")
          .select("id, display_name, slug")
          .in("id", claimantIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);
  const locations = new Map(
    (locationData ?? []).map((l) => [
      l.id as string,
      {
        name: l.name as string,
        place: [l.address, l.city, l.country].filter(Boolean).join(", "),
        claimStatus: l.claim_status as string,
      },
    ]),
  );
  const claimants = new Map(
    (profileData ?? []).map((p) => [
      p.id as string,
      {
        name:
          ((p.display_name as string | null) || (p.slug as string | null)) ??
          "Unknown",
        slug: (p.slug as string | null) ?? null,
      },
    ]),
  );

  const rows: ClaimRow[] = claims.map((c) => {
    const loc = locations.get(c.map_location_id);
    const who = claimants.get(c.claimant_user_id);
    return {
      id: c.id,
      locationId: c.map_location_id,
      locationName: loc?.name ?? "Removed entry",
      locationPlace: loc?.place ?? "",
      // Authoritative state, maintained by the claim cores.
      contested: loc?.claimStatus === "claim_conflict",
      locationClaimed: loc?.claimStatus === "claimed",
      claimantName: who?.name ?? "Deleted account",
      claimantSlug: who?.slug ?? null,
      claimantRole: c.claimant_role,
      socialLink: c.social_link,
      addressConfirmation: c.address_confirmation,
      evidenceNote: c.evidence_note,
      createdAt: c.created_at,
    };
  });

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
          / Claims
        </p>
        <h1 className="text-xl font-semibold text-foreground">Studio claims</h1>
        <p className="text-sm text-muted-foreground">
          Approving a claim makes the claimant the studio owner and rejects any
          other pending claims on the same location. Contested locations stay
          frozen until you decide; ownership never moves on its own.
        </p>
      </div>
      <ClaimsQueue rows={rows} />
    </main>
  );
}
