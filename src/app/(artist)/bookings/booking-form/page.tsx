import { createClient } from "@/lib/supabase/server";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { parseFormSettings, buildDefaultFieldOrder } from "@/lib/form-settings";
import { parseBooksSettings } from "@/lib/books-settings";
import { isDateKeyBefore, todayInTimeZone } from "@/lib/date-utils";
import UnifiedFieldList from "../form/unified-field-list";
import PublicPageClient from "../public-page/public-page-client";
import FormAppearanceForm from "../settings/form-appearance-form";
import Link from "next/link";

export default async function BookingFormPage() {
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
    supabase
      .from("profiles")
      .select("slug, settings, timezone")
      .eq("id", user!.id)
      .single(),
  ]);

  const profileSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const formSettings = parseFormSettings(profileSettings.form_settings);
  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const customFieldIds = ((fields ?? []) as CustomFieldDef[]).map((f) => f.id);
  const initialOrder = Array.isArray(profileSettings.field_order)
    ? (profileSettings.field_order as string[])
    : buildDefaultFieldOrder(customFieldIds);
  const slug = profile?.slug ?? "";
  const timezone = profile?.timezone ?? "Europe/Berlin";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const publicUrl = `${appUrl}/${slug}`;

  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    isDateKeyBefore(
      booksSettings.booking_window_ends_at,
      todayInTimeZone(timezone),
    );
  const isOpen = booksSettings.books_open && !windowExpired;

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Booking Form
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage what appears on your public form and share your booking link.
        </p>
      </div>

      {/* Share public page */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Share public page
          </h2>
          <p className="mt-1.5 text-sm text-foreground">
            Share this link with clients.
          </p>
        </div>

        <PublicPageClient publicUrl={publicUrl} slug={slug} />

        <div className="overflow-hidden rounded-[20px] border border-border divide-y divide-border">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                Availability
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isOpen
                  ? "Currently accepting requests"
                  : "Closed to new requests"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 text-sm font-medium ${isOpen ? "text-brand-green" : "text-muted-foreground"}`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-brand-green" : "bg-muted-foreground"}`}
                />
                {isOpen ? "Open" : "Closed"}
              </span>
              <Link
                href="/bookings/settings"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Form fields */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Form fields
          </h2>
          <p className="mt-1.5 text-sm text-foreground">
            Toggle fields on or off, drag to reorder, and add custom questions.
            The order here matches what clients see.
          </p>
        </div>
        <UnifiedFieldList
          key={fields?.length ?? 0}
          initialSettings={formSettings}
          customFields={(fields as CustomFieldDef[]) ?? []}
          initialOrder={initialOrder}
        />
      </section>

      {/* Form appearance */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Appearance
          </h2>
          <p className="mt-1.5 text-sm text-foreground">
            Choose the colour theme of your public booking form.
          </p>
        </div>
        <FormAppearanceForm current={booksSettings.form_appearance} />
      </section>
    </div>
  );
}
