import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { parseBioPageSettings } from "@/lib/bio-page-settings";
import { publicHubUrl } from "@/lib/public-url";
import { listCollectionsForArtist } from "@/lib/server/collections";
import { liveCollections } from "@inklee/shared/collections";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { richContentBlocksAllowed } from "@/lib/server/entitlement-gates";
import BioPageForm from "./bio-page-form";

export default async function BioPageSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", user!.id)
    .single();

  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const bioPage = parseBioPageSettings(settings.bio_page);
  const hubUrl = profile?.slug ? publicHubUrl(profile.slug) : null;

  // Only LIVE collections are offerable. Featuring an archived section would
  // produce a block that renders nothing, which reads as a bug.
  const collections = liveCollections(
    await listCollectionsForArtist(supabase, user!.id),
  ).map((c) => ({ id: c.id, name: c.name }));

  // The rich blocks (image gallery) are gated on their own rich_content_blocks
  // entitlement (founder ruling FD1, 2026-08-01, SUPERSEDES the earlier
  // appearance_custom gate). The editor only offers them to an entitled
  // artist; the server enforces the boundary at render + save.
  const richBlocksAllowed = richContentBlocksAllowed(
    await getAccountOverrides(user!.id),
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Link Hub
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your standalone link page. Add your socials and links and share it
          from your bio. Optional and separate from your booking page. The
          booking policy below still shows on your booking page.
        </p>
      </div>

      {hubUrl && (
        <a
          href={hubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        >
          Preview your Link Hub
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}

      <BioPageForm
        bioPage={bioPage}
        collections={collections}
        richBlocksAllowed={richBlocksAllowed}
      />
    </div>
  );
}
