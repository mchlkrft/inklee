import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { parseBioPageSettings } from "@/lib/bio-page-settings";
import { publicArtistUrl } from "@/lib/public-url";
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
  const publicUrl = profile?.slug ? publicArtistUrl(profile.slug) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Bio page
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your public page is more than a booking form. Add your links and
          booking policy, and choose what shows. Booking stays the main action.
        </p>
      </div>

      {publicUrl && (
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        >
          Preview public page
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}

      <BioPageForm bioPage={bioPage} />
    </div>
  );
}
