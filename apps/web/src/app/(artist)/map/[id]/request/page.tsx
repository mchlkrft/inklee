import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import RequestForm from "./request-form";

export const metadata: Metadata = {
  title: "Request a guest spot",
  robots: { index: false, follow: false },
};

export default async function GuestSpotRequestPage({
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

  const { data: location } = await serviceClient
    .from("map_locations")
    .select("id, name, city, studio_profile_id, moderation_status")
    .eq("id", id)
    .eq("moderation_status", "approved")
    .maybeSingle();
  if (!location?.studio_profile_id) notFound();

  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select(
      "id, name, city, owner_user_id, publication_status, guest_spot_status",
    )
    .eq("id", location.studio_profile_id as string)
    .maybeSingle();
  if (
    !studio ||
    studio.publication_status !== "published" ||
    studio.guest_spot_status !== "accepting" ||
    studio.owner_user_id === user.id
  )
    notFound();

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
          Request a guest spot
        </h1>
        <p className="text-sm text-muted-foreground">
          Tell {studio.name as string} when you want to come and what you have
          in mind. They see your name, your link and this message.
        </p>
      </header>
      <RequestForm studioProfileId={studio.id as string} />
    </div>
  );
}
