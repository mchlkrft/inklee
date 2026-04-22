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
        <h1 className="text-2xl font-semibold text-foreground">booking form</h1>
        <p className="text-sm text-muted-foreground mt-1">
          configure what appears on your public booking page.
        </p>
      </div>

      {/* Standard fields */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            standard fields
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            built-in fields — fixed ones are always shown. use the toggles to
            configure the optional ones.
          </p>
        </div>
        <StandardFields settings={formSettings} />
      </section>

      {/* Custom fields */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">custom fields</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            add your own questions. active fields appear after the standard
            fields, in the order shown below.
          </p>
        </div>
        <FieldList fields={(fields as CustomFieldDef[]) ?? []} />
      </section>
    </div>
  );
}
