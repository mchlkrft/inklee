import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { getSeedCandidate } from "@/lib/server/map-seeding";
import {
  CONVERTIBLE_CANDIDATE_TYPES,
  canTransitionSeedCandidate,
  instagramHandleFromSeedUrl,
} from "@inklee/shared/map-seeding";
import LocationForm from "../../../../location-form";

export const metadata = { title: "Admin · Convert candidate" };

export default async function ConvertCandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const candidate = await getSeedCandidate(id);
  if (!candidate) notFound();
  if (!canTransitionSeedCandidate(candidate.status, "converted")) notFound();

  // Candidate-only types (tattoo_artist, uncertain) prefill as tattoo_studio;
  // the category select in the form is the re-typing step.
  const category = (CONVERTIBLE_CANDIDATE_TYPES as string[]).includes(
    candidate.candidateType,
  )
    ? candidate.candidateType
    : "tattoo_studio";

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <p className="text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>{" "}
          /{" "}
          <Link href="/admin/map/seeding" className="hover:text-foreground">
            Seeding
          </Link>{" "}
          / Convert
        </p>
        <h1 className="text-xl font-semibold text-foreground">
          Convert candidate
        </h1>
        <p className="text-sm text-muted-foreground">
          Creates an unclaimed studio shell through the same pipeline as every
          admin entry: validation, the density cap, duplicate warnings. Fill the
          missing fields; the Places picker can complete coordinates and the
          address.
        </p>
        {candidate.attribution ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Source: {candidate.attribution}
          </p>
        ) : null}
      </div>
      <LocationForm
        placesApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
        convertCandidateId={candidate.id}
        initial={{
          name: candidate.name,
          category,
          latitude: candidate.latitude ?? Number.NaN,
          longitude: candidate.longitude ?? Number.NaN,
          address: null,
          city: candidate.city,
          country: candidate.country,
          postalCode: null,
          googlePlaceId: null,
          websiteUrl: candidate.websiteUrl,
          instagramHandle: instagramHandleFromSeedUrl(candidate.socialUrl),
          source: "inklee_seed",
          moderationStatus: "approved",
          isSeed: true,
        }}
      />
    </main>
  );
}
