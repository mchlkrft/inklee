import { createClient } from "@/lib/supabase/server";
import { parseAppearance } from "@inklee/shared/appearance";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { appearanceCustomAllowed } from "@/lib/server/entitlement-gates";
import AppearanceForm from "./appearance-form";

export const metadata = { title: "Appearance" };

export default async function AppearanceSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user!.id)
    .single();

  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  // Parsed with legacy read-through, so the editor opens showing what the
  // artist's pages ACTUALLY look like today, not an empty form.
  const appearance = parseAppearance(settings);

  let entitled = false;
  try {
    entitled = appearanceCustomAllowed(await getAccountOverrides(user!.id));
  } catch {
    entitled = false;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Appearance
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Make Inklee yours. These choices apply to your public pages: your
          Inklee page, your booking form, and your shop.
        </p>
      </div>
      <AppearanceForm appearance={appearance} entitled={entitled} />
    </div>
  );
}
