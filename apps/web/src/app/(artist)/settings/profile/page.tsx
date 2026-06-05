import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./profile-form";

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
    </div>
  );
}
