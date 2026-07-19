import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { serviceClient } from "@/lib/supabase/service";
import LocationForm, { type LocationFormValues } from "../location-form";

export const metadata = { title: "Admin · Edit map location" };

export default async function AdminMapEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const { data } = await serviceClient
    .from("map_locations")
    .select(
      "id, source, category, name, latitude, longitude, address, city, country, postal_code, google_place_id, website_url, instagram_handle, phone, opening_hours, claim_status, moderation_status, is_seed, seed_region_bucket, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const initial: LocationFormValues = {
    id: data.id as string,
    name: data.name as string,
    category: data.category as string,
    latitude: data.latitude as number,
    longitude: data.longitude as number,
    address: (data.address as string | null) ?? null,
    city: (data.city as string | null) ?? null,
    country: (data.country as string | null) ?? null,
    postalCode: (data.postal_code as string | null) ?? null,
    googlePlaceId: (data.google_place_id as string | null) ?? null,
    websiteUrl: (data.website_url as string | null) ?? null,
    instagramHandle: (data.instagram_handle as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    openingHours: (data.opening_hours as string | null) ?? null,
    source: data.source as string,
    moderationStatus: data.moderation_status as string,
    isSeed: data.is_seed as boolean,
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>{" "}
          /{" "}
          <Link href="/admin/map" className="hover:text-foreground">
            Map directory
          </Link>{" "}
          / Edit
        </p>
        <h1 className="text-xl font-semibold text-foreground">
          {initial.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Claim state: {(data.claim_status as string).replace("_", " ")}
          {data.is_seed
            ? ` · seed bucket ${data.seed_region_bucket ?? "unset"}`
            : ""}
        </p>
      </div>
      <LocationForm
        initial={initial}
        placesApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
      />
    </main>
  );
}
