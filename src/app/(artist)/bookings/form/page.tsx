import { createClient } from "@/lib/supabase/server";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { parseFormSettings } from "@/lib/form-settings";
import FieldList from "./field-list";
import StandardFields from "./standard-fields";

export default async function BookingFormSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: fields }, { data: profile }] = await Promise.all([
    supabase
      .from("custom_fields")
      .select("*")
      .eq("artist_id", user!.id)
      .is("deleted_at", null)
      .order("position", { ascending: true }),
    supabase.from("profiles").select("settings").eq("id", user!.id).single(),
  ]);

  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const formSettings = parseFormSettings(settings.form_settings);

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Booking form</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure what appears on your public booking page.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            Standard fields
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Built-in fields. Fixed ones are always shown. Use the toggles to
            configure the optional ones.
          </p>
        </div>
        <StandardFields settings={formSettings} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Custom fields</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add your own questions. Active fields appear after the standard
            fields, in the order shown below.
          </p>
        </div>
        <FieldList fields={(fields as CustomFieldDef[]) ?? []} />
      </section>
    </div>
  );
}
