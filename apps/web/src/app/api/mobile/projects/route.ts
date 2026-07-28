import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { largeProjectsAllowed } from "@/lib/server/entitlement-gates";
import { publicArtistUrl } from "@/lib/public-url";
import {
  OPEN_PROJECT_STATUSES,
  isProjectStatus,
  type ProjectRecord,
} from "@inklee/shared/projects";
import type { MobileProjectList } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/projects — the native twin of /bookings/projects.
//
// Reading is deliberately NOT gated (see largeProjectsAllowed): a downgrade
// must never hide an artist's long-term records, some of which have live
// bookings attached. `entitled` rides along so the app can explain whether new
// enquiries are being taken, without re-deriving a plan rule.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const url = new URL(req.url);
  const filter = url.searchParams.get("status");
  const showAll = filter === "all";

  let query = supabase
    .from("projects")
    .select("*")
    .eq("artist_id", userId)
    .order("created_at", { ascending: false });
  if (!showAll) query = query.in("status", OPEN_PROJECT_STATUSES);

  const [{ data, error }, profileRes] = await Promise.all([
    query,
    supabase.from("profiles").select("slug").eq("id", userId).single(),
  ]);
  if (error) return mobileError(500, error.message);

  let entitled = false;
  try {
    entitled = largeProjectsAllowed(await getAccountOverrides(userId));
  } catch {
    entitled = false;
  }

  const slug = (profileRes.data?.slug as string | null) ?? null;
  const body: MobileProjectList = {
    entitled,
    // Server-derived: the app has been wrong about the public host before.
    intakeUrl: slug ? `${publicArtistUrl(slug)}/project` : null,
    projects: ((data ?? []) as ProjectRecord[])
      .filter((p) => isProjectStatus(p.status))
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        customerEmail: p.customer_email,
        scale: p.scale,
        bodyAreas: p.body_areas ?? [],
        createdAt: p.created_at,
      })),
  };
  return mobileOk(body);
}
