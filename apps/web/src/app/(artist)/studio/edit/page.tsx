import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import {
  getHouseRulesForOwner,
  getOwnedStudio,
  getStudioMediaForOwner,
  getWelcomePackForOwner,
} from "@/lib/server/studios";
import StudioEditor from "./studio-editor";
import StudioMediaSection from "./studio-media-section";
import HouseRulesSection from "./house-rules-section";
import WelcomePackSection from "./welcome-pack-section";

export const metadata = { title: "Edit studio" };

export default async function EditStudioPage() {
  if (!tattooMapEnabled()) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const studio = await getOwnedStudio(user.id);
  if (!studio) redirect("/studio");

  const [{ data: styleData }, media, houseRules, welcomePack] =
    await Promise.all([
      serviceClient
        .from("styles")
        .select("key, label")
        .order("position", { ascending: true }),
      getStudioMediaForOwner(user.id, studio.id),
      getHouseRulesForOwner(user.id, studio.id),
      getWelcomePackForOwner(user.id, studio.id),
    ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/studio"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Studio
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">Edit studio</h1>
        <p className="text-sm text-muted-foreground">
          Details, categories, logo and photos. Everything a visiting artist
          sees.
        </p>
      </header>
      {media ? <StudioMediaSection studioId={studio.id} media={media} /> : null}
      <StudioEditor
        studio={studio}
        styles={(styleData ?? []).map((s) => ({
          key: s.key as string,
          label: s.label as string,
        }))}
      />
      <HouseRulesSection studioId={studio.id} initialRules={houseRules ?? []} />
      {welcomePack ? (
        <WelcomePackSection studioId={studio.id} initial={welcomePack} />
      ) : null}
    </div>
  );
}
