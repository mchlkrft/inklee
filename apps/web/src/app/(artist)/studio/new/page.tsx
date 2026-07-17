import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled } from "@/lib/map-features";
import { getOwnedStudio } from "@/lib/server/studios";
import CreateStudioForm from "./create-studio-form";

export const metadata = { title: "Start your studio" };

export default async function NewStudioPage() {
  if (!tattooMapEnabled()) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // One studio per owner: send an existing owner to their cockpit.
  const existing = await getOwnedStudio(user.id);
  if (existing) redirect("/studio");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/studio"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Studio
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">
          Start your studio
        </h1>
        <p className="text-sm text-muted-foreground">
          Find your studio, add a social link, and you are set up. You can fill
          in photos, categories and the rest right after.
        </p>
      </header>
      <CreateStudioForm
        placesApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
      />
    </div>
  );
}
