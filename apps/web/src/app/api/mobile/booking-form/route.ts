import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  parseFormSettings,
  buildDefaultFieldOrder,
  type FormSettings,
} from "@/lib/form-settings";
import { parseBooksSettings } from "@/lib/books-settings";
import { isDateKeyBefore, todayInTimeZone } from "@/lib/date-utils";
import type { CustomFieldDef } from "@/lib/custom-fields";
import type {
  MobileBookingForm,
  MobileBookingFormField,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// Standard-field metadata — mirrors the STD config in the web unified field
// list (apps/web/src/app/(artist)/bookings/form/unified-field-list.tsx) so the
// mobile summary shows the same labels and always-on / always-required rules
// the web editor enforces.
type StdConfig = {
  id: string;
  label: string;
  showKey?: keyof FormSettings; // visibility flag; omitted = always shown
  requireKey?: keyof FormSettings; // required flag; omitted = none
  alwaysRequired?: boolean; // email: always shown + always required
};

const STD: StdConfig[] = [
  {
    id: "instagram_handle",
    label: "Instagram handle",
    showKey: "show_instagram_handle",
    requireKey: "require_instagram_handle",
  },
  { id: "email", label: "Email", alwaysRequired: true },
  {
    id: "reference_link",
    label: "Reference link",
    showKey: "show_reference_link",
    requireKey: "require_reference_link",
  },
  {
    id: "placement",
    label: "Placement",
    showKey: "show_placement",
    requireKey: "require_placement",
  },
  {
    id: "size",
    label: "Size",
    showKey: "show_size",
    requireKey: "require_size",
  },
  {
    id: "description",
    label: "Description",
    showKey: "show_description",
    requireKey: "require_description",
  },
  {
    id: "image_upload",
    label: "Reference images",
    showKey: "show_image_upload",
    requireKey: "require_image_upload",
  },
  { id: "preferred_date", label: "Preferred date / slot" },
];

const STD_MAP = new Map(STD.map((s) => [s.id, s]));

// Custom-field type badges (same labels as the web TYPE_BADGE map).
const TYPE_BADGE: Record<string, string> = {
  short_text: "Text",
  long_text: "Textarea",
  number: "Number",
  select: "Dropdown",
  radio: "Radio",
  checkbox: "Checkbox",
  date: "Date",
};

function stdRow(cfg: StdConfig, fs: FormSettings): MobileBookingFormField {
  return {
    id: cfg.id,
    kind: "standard",
    label: cfg.label,
    typeLabel: null,
    enabled: cfg.showKey ? fs[cfg.showKey] : true,
    required: cfg.alwaysRequired
      ? true
      : cfg.requireKey
        ? fs[cfg.requireKey]
        : false,
    alwaysOn: !cfg.showKey,
  };
}

function customRow(f: CustomFieldDef): MobileBookingFormField {
  return {
    id: f.id,
    kind: "custom",
    label: f.label,
    typeLabel: TYPE_BADGE[f.type] ?? f.type,
    enabled: f.active,
    required: f.required,
    alwaysOn: false,
  };
}

// GET /api/mobile/booking-form — read-only aggregate for the mobile
// booking-form summary screen. Mirrors the web page's reads + derivations
// (apps/web/src/app/(artist)/bookings/booking-form/page.tsx): custom fields
// (deleted_at null, position order), parsed form_settings, the field_order
// interleave, the open-slot count, and the isOpen / windowExpired /
// isFixedSlotsWithoutSlots rules computed in the artist's timezone. Read-only;
// RLS scopes every query to the artist.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const [fieldsRes, profileRes, slotsRes] = await Promise.all([
    supabase
      .from("custom_fields")
      .select("*")
      .eq("artist_id", userId)
      .is("deleted_at", null)
      .order("position", { ascending: true }),
    supabase
      .from("profiles")
      .select("slug, settings, timezone, booking_mode")
      .eq("id", userId)
      .single(),
    supabase
      .from("slots")
      .select("*", { count: "exact", head: true })
      .eq("artist_id", userId)
      .eq("status", "open"),
  ]);
  if (profileRes.error || !profileRes.data) {
    return mobileError(500, profileRes.error?.message ?? "Profile not found.");
  }
  if (fieldsRes.error) return mobileError(500, fieldsRes.error.message);

  const profile = profileRes.data;
  const customFields = (fieldsRes.data ?? []) as CustomFieldDef[];
  const openSlotCount = slotsRes.count ?? 0;

  const profileSettings = (profile.settings ?? {}) as Record<string, unknown>;
  const formSettings = parseFormSettings(profileSettings.form_settings);
  const booksSettings = parseBooksSettings(profileSettings.books_settings);
  const order = Array.isArray(profileSettings.field_order)
    ? (profileSettings.field_order as string[])
    : buildDefaultFieldOrder(customFields.map((f) => f.id));
  const timezone = (profile.timezone as string | null) ?? "Europe/Berlin";
  const bookingMode =
    (profile.booking_mode as string | null) ?? "preferred_date";

  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    isDateKeyBefore(
      booksSettings.booking_window_ends_at,
      todayInTimeZone(timezone),
    );
  const isOpen = booksSettings.books_open && !windowExpired;
  const isFixedSlotsWithoutSlots =
    bookingMode === "fixed_slots" && openSlotCount === 0;

  // Interleave standard + custom rows in the saved field_order, then append
  // any fields not yet in the order (mirrors buildRows in the web field list).
  const rows: MobileBookingFormField[] = [];
  const usedStd = new Set<string>();
  const usedCustom = new Set<string>();
  for (const key of order) {
    const std = STD_MAP.get(key);
    if (std) {
      rows.push(stdRow(std, formSettings));
      usedStd.add(key);
      continue;
    }
    const cf = customFields.find((f) => f.id === key);
    if (cf) {
      rows.push(customRow(cf));
      usedCustom.add(key);
    }
  }
  for (const s of STD) {
    if (!usedStd.has(s.id)) rows.push(stdRow(s, formSettings));
  }
  for (const cf of customFields) {
    if (!usedCustom.has(cf.id)) rows.push(customRow(cf));
  }

  const body: MobileBookingForm = {
    slug: (profile.slug as string | null) ?? null,
    bookingMode,
    isOpen,
    windowExpired,
    openSlotCount,
    isFixedSlotsWithoutSlots,
    allowPhotoAnnotations: formSettings.allow_photo_annotations,
    fields: rows,
  };
  return mobileOk(body);
}
