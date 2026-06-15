import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  parseDashboardWidgets,
  type DashboardWidgets,
} from "@/lib/dashboard-settings";

export const runtime = "nodejs";

const KEYS: (keyof DashboardWidgets)[] = [
  "pending_requests",
  "upcoming_appointments",
  "guest_spots",
  "waitlist",
  "booking_link",
];

// GET /api/mobile/settings/dashboard — the artist's home-widget visibility for the
// settings screen. The Home aggregate (/api/mobile/home) also returns these, but
// the dedicated edit screen reads them here.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return mobileError(500, error?.message ?? "Profile not found.");
  }
  const settings = (data.settings ?? {}) as Record<string, unknown>;
  return mobileOk(parseDashboardWidgets(settings.dashboard_widgets));
}

// POST /api/mobile/settings/dashboard — save the five widget toggles. Ports the
// web saveDashboardWidgetsAction: merge into profiles.settings.dashboard_widgets
// WITHOUT clobbering the rest of the settings JSON. RLS-scoped to the artist.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const r = (raw ?? {}) as Record<string, unknown>;
  if (KEYS.some((k) => typeof r[k] !== "boolean")) {
    return mobileError(400, "Each widget flag must be a boolean.");
  }
  const widgets: DashboardWidgets = {
    pending_requests: r.pending_requests as boolean,
    upcoming_appointments: r.upcoming_appointments as boolean,
    guest_spots: r.guest_spots as boolean,
    waitlist: r.waitlist as boolean,
    booking_link: r.booking_link as boolean,
  };

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const current = (profile.settings ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...current, dashboard_widgets: widgets },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk(widgets);
}
