import { createClient } from "@/lib/supabase/server";
import type { CustomFieldDef } from "@/lib/custom-fields";
import FieldList from "./field-list";

export default async function CustomFieldsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: fields } = await supabase
    .from("custom_fields")
    .select("*")
    .eq("artist_id", user!.id)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          custom fields
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          add extra questions to your booking form. active fields appear in the
          order shown below.
        </p>
      </div>

      <FieldList fields={(fields as CustomFieldDef[]) ?? []} />
    </div>
  );
}
