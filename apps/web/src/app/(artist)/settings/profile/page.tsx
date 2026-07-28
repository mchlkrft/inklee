import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./profile-form";
import SlugForm from "./slug-form";
import { publicArtistUrl } from "@/lib/public-url";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { formCustomAllowed } from "@/lib/server/entitlement-gates";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

  // Custom URL slug (P3e). The prefix is derived from the real public URL so
  // the form shows the address clients actually use (subdomain or path form),
  // not a second hardcoded guess at it.
  const slug = (profile?.slug as string | null) ?? null;
  const publicHost = slug
    ? publicArtistUrl(slug).replace(new RegExp(`${slug}$`), "")
    : "";
  let slugEntitled = false;
  try {
    slugEntitled = formCustomAllowed(await getAccountOverrides(user!.id));
  } catch {
    slugEntitled = false;
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Profile
        </h1>
        <p className="text-sm text-muted-foreground">
          This information appears on your public booking page.
        </p>
        {profile?.slug && (
          <a
            href={`${appUrl}/${profile.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Preview public page &rarr;
          </a>
        )}
      </div>
      <ProfileForm profile={profile} />

      {slug && (
        <section className="space-y-3 border-t border-border pt-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Public link
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The address you share with clients.
            </p>
          </div>
          <SlugForm
            currentSlug={slug}
            entitled={slugEntitled}
            publicHost={publicHost}
          />
        </section>
      )}
    </div>
  );
}
