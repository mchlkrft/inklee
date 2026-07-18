import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import { getOwnedStudio } from "@/lib/server/studios";
import ClaimForm from "./claim-form";

export const metadata: Metadata = {
  title: "Claim this studio",
  robots: { index: false, follow: false },
};

export default async function ClaimStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!tattooMapEnabled()) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { id } = await params;

  // One studio per owner: existing owners go to their cockpit instead.
  const owned = await getOwnedStudio(user.id);
  if (owned) redirect("/studio");

  const { data: location } = await serviceClient
    .from("map_locations")
    .select("id, name, address, city, country, claim_status")
    .eq("id", id)
    .eq("moderation_status", "approved")
    .neq("category", "supply_shop")
    .maybeSingle();
  if (!location) notFound();
  if (location.claim_status === "claimed") redirect(`/map/${id}`);

  const { data: existingClaim } = await supabase
    .from("location_claims")
    .select("id, status")
    .eq("map_location_id", id)
    .eq("claimant_user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  const place = [location.address, location.city, location.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href={`/map/${id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; {location.name as string}
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">
          Claim {location.name as string}
        </h1>
        <p className="text-sm text-muted-foreground">
          {place}
          {place ? ". " : ""}Tell us who you are and we take a look. No
          documents needed; a social link that clearly belongs to the studio
          does the job.
        </p>
      </header>
      {existingClaim ? (
        <div className="rounded-2xl border border-border p-5">
          <p className="text-sm text-foreground">
            Your claim is in. We check it and you see the result under{" "}
            <Link href="/studio" className="underline">
              Studio
            </Link>
            .
          </p>
        </div>
      ) : (
        <ClaimForm mapLocationId={id} />
      )}
    </div>
  );
}
