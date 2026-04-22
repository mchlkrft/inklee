import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import OnboardingProgress from "@/components/onboarding-progress";

export default async function OnboardingDonePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", user!.id)
    .single();

  if (!profile?.slug) redirect("/onboarding/claim-slug");

  const currentSettings = (profile.settings ?? {}) as Record<string, unknown>;
  if (!currentSettings.onboarding_completed) {
    await supabase
      .from("profiles")
      .update({
        settings: { ...currentSettings, onboarding_completed: true },
        updated_at: new Date().toISOString(),
      })
      .eq("id", user!.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const publicUrl = `${appUrl}/${profile.slug}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          You&apos;re all set
        </h1>
        <p className="text-sm text-muted-foreground">
          Your booking page is live and ready to share.
        </p>
      </div>

      <OnboardingProgress current={4} />

      <div className="rounded-md border border-border p-4 space-y-3">
        <p className="text-xs text-muted-foreground">Your booking link</p>
        <p className="text-sm font-mono text-foreground">
          {publicUrl.replace(/^https?:\/\//, "")}
        </p>
        <div className="flex gap-2">
          <a
            href={`/${profile.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs rounded border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            Preview ↗
          </a>
        </div>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          — Go to <span className="text-foreground">Settings → Profile</span> to
          add a logo and bio
        </p>
        <p>
          — Go to <span className="text-foreground">Bookings → Books</span> to
          open or close requests
        </p>
        <p>
          — Share your booking link on Instagram, in your bio, or wherever your
          clients find you
        </p>
      </div>

      <Link
        href="/dashboard"
        className="block w-full text-center rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background"
      >
        Go to dashboard →
      </Link>
    </div>
  );
}
