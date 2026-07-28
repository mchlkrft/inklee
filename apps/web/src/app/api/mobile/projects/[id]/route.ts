import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { UUID_RE } from "@/lib/mobile-booking-form";
import {
  loadProject,
  signProjectMedia,
  setProjectStatusCore,
  saveProjectNoteCore,
} from "@/lib/server/projects";
import type { MobileProjectDetail } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET / PATCH /api/mobile/projects/:id — the native twin of the project detail
// screen. Both verbs go through the same cores the web actions use, so the
// transition rules and the deliberate absence of an entitlement check on
// existing projects cannot drift between surfaces.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return mobileError(404, "Project not found.", "not_found");
  }

  const project = await loadProject(userId, id);
  if (!project) return mobileError(404, "Project not found.", "not_found");

  const [{ data: mediaRows }, { data: sessions }] = await Promise.all([
    supabase
      .from("project_media")
      .select("id, storage_path")
      .eq("project_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("booking_requests")
      .select("id, status, preferred_date")
      .eq("project_id", id)
      .order("preferred_date", { ascending: true }),
  ]);

  const media = mediaRows ?? [];
  // Signed per request and short-lived: the bucket is private and these are
  // body photographs.
  const signed = await signProjectMedia(media.map((m) => m.storage_path));

  const body: MobileProjectDetail = {
    project,
    mediaUrls: media
      .map((m) => signed[m.storage_path])
      .filter((u): u is string => !!u),
    sessions: (sessions ?? []).map((s) => ({
      id: s.id as string,
      status: s.status as string,
      preferredDate: (s.preferred_date as string | null) ?? null,
    })),
  };
  return mobileOk(body);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId } = auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return mobileError(404, "Project not found.", "not_found");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // One field per call, like the other mobile settings routes: a combined
  // write would need a partial-failure story for two independent edits.
  if ("status" in b) {
    const result = await setProjectStatusCore(userId, id, b.status);
    if (!result.ok) {
      return mobileError(
        result.code === "not_found" ? 404 : 400,
        result.error,
        result.code,
      );
    }
    return mobileOk({ ok: true });
  }

  if ("note" in b) {
    const result = await saveProjectNoteCore(userId, id, b.note);
    if (!result.ok) {
      return mobileError(
        result.code === "not_found" ? 404 : 500,
        result.error,
        result.code,
      );
    }
    return mobileOk({ ok: true });
  }

  return mobileError(400, "Nothing to update.");
}
