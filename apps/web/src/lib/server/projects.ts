import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  projectIntakeSchema,
  validateBudgetRange,
  canTransitionProject,
  isProjectStatus,
  PROJECT_MAX_IMAGES,
  PROJECT_NOTE_MAX,
  type ProjectRecord,
} from "@inklee/shared/projects";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { largeProjectsAllowed } from "./entitlement-gates";
import { processImage } from "@/lib/image-processing";

// Server cores for large-project mode (Plus build P4).
//
// Everything that writes a project goes through here, so the public intake,
// the web artist actions and the mobile routes cannot drift. The RLS posture
// (0115) gives the artist SELECT only; every write below runs service-role
// AFTER an explicit ownership or entitlement check, matching the 0080 house
// convention, because RLS cannot express "this transition is legal" or "this
// artist may create projects at all".

export type ProjectSubmitResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string; field?: string };

/** Where project media lives. The existing private `bookings` bucket under a
 *  `projects/` prefix: same kind of object, same lifecycle, so no second
 *  bucket, policy set or cleanup job is introduced to hold it. */
const MEDIA_BUCKET = "bookings";
const mediaPath = (artistId: string, projectId: string) =>
  `projects/${artistId}/${projectId}/${crypto.randomUUID()}.webp`;

/**
 * Submit a project intake. Public entry point: the caller has already resolved
 * the artist from the slug and confirmed the intake is reachable.
 *
 * Images are uploaded AFTER the row exists (they are keyed by project id) and
 * rolled back on any later failure, the same discipline the booking intake
 * uses. A half-uploaded set with no rows pointing at it is invisible storage
 * cost forever.
 */
export async function submitProjectIntakeCore(
  artistId: string,
  raw: unknown,
  images: File[],
): Promise<ProjectSubmitResult> {
  // Entitlement is re-checked here rather than trusted from the route: the
  // route gate hides the page, this one is what actually refuses a write.
  try {
    if (!largeProjectsAllowed(await getAccountOverrides(artistId))) {
      return {
        ok: false,
        error: "This artist isn't taking project enquiries.",
      };
    }
  } catch {
    // Fail CLOSED on the write path. A public submit that cannot verify the
    // artist's plan must not create a record the artist may not be able to
    // work with; the visitor can retry.
    return { ok: false, error: "Couldn't submit right now. Please try again." };
  }

  const parsed = projectIntakeSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue.message,
      field: String(issue.path[0] ?? ""),
    };
  }
  const data = parsed.data;

  const budgetError = validateBudgetRange(
    data.budgetMinCents,
    data.budgetMaxCents,
  );
  if (budgetError) {
    return { ok: false, error: budgetError, field: "budgetMaxCents" };
  }

  const realImages = images
    .filter((f) => f && f.size > 0)
    .slice(0, PROJECT_MAX_IMAGES);

  const { data: inserted, error: insertError } = await serviceClient
    .from("projects")
    .insert({
      artist_id: artistId,
      customer_email: data.customerEmail.toLowerCase(),
      customer_handle: data.customerHandle ?? null,
      title: data.title,
      description: data.description,
      long_term_goal: data.longTermGoal ?? null,
      body_areas: data.bodyAreas,
      coverage: data.coverage ?? null,
      available_areas: data.availableAreas ?? null,
      styles: data.styles,
      scale: data.scale,
      session_commitment: data.sessionCommitment ?? null,
      travel_availability: data.travelAvailability ?? null,
      budget_min_cents: data.budgetMinCents ?? null,
      budget_max_cents: data.budgetMaxCents ?? null,
      consultation_method: data.consultationMethod ?? null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    Sentry.captureException(insertError, {
      tags: { action: "project_intake_insert" },
      extra: { artistId },
    });
    return { ok: false, error: "Couldn't submit right now. Please try again." };
  }
  const projectId = inserted.id as string;

  const uploaded: string[] = [];
  const rollback = async () => {
    if (uploaded.length > 0) {
      await serviceClient.storage.from(MEDIA_BUCKET).remove(uploaded);
    }
    await serviceClient.from("projects").delete().eq("id", projectId);
  };

  for (const [index, file] of realImages.entries()) {
    const path = mediaPath(artistId, projectId);
    try {
      const processed = await processImage(file);
      const { error: uploadError } = await serviceClient.storage
        .from(MEDIA_BUCKET)
        .upload(path, processed.buffer, { contentType: "image/webp" });
      if (uploadError) throw new Error(uploadError.message);
      uploaded.push(path);

      const { error: mediaError } = await serviceClient
        .from("project_media")
        .insert({
          project_id: projectId,
          artist_id: artistId,
          storage_path: path,
          original_filename: file.name.slice(0, 200),
          mime_type: "image/webp",
          width: processed.width,
          height: processed.height,
          file_size: processed.buffer.length,
          sort_order: index,
        });
      if (mediaError) throw new Error(mediaError.message);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { action: "project_intake_media" },
        extra: { artistId, projectId, index },
      });
      await rollback();
      return {
        ok: false,
        error: "One of the photos couldn't be uploaded. Try again.",
      };
    }
  }

  return { ok: true, projectId };
}

export type ProjectMutationResult =
  | { ok: true }
  | { ok: false; error: string; code?: "not_found" | "invalid_transition" };

/** Read one project, scoped to its owner. Returns null rather than throwing so
 *  callers render a not-found instead of a 500 on a stale link. */
export async function loadProject(
  artistId: string,
  projectId: string,
): Promise<ProjectRecord | null> {
  const { data } = await serviceClient
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("artist_id", artistId)
    .maybeSingle();
  return (data as ProjectRecord | null) ?? null;
}

/**
 * Move a project to a new status.
 *
 * Reading is NOT gated by the entitlement and neither is this: an artist who
 * downgrades must still be able to finish, decline or archive work already in
 * flight, some of which has live bookings attached. The gate stops NEW
 * projects, which is where the value actually is.
 */
export async function setProjectStatusCore(
  artistId: string,
  projectId: string,
  next: unknown,
): Promise<ProjectMutationResult> {
  if (!isProjectStatus(next)) {
    return { ok: false, error: "Unknown status." };
  }

  const project = await loadProject(artistId, projectId);
  if (!project)
    return { ok: false, error: "Project not found.", code: "not_found" };
  if (project.status === next) return { ok: true };

  if (!canTransitionProject(project.status, next)) {
    return {
      ok: false,
      error: "That isn't a step this project can take from here.",
      code: "invalid_transition",
    };
  }

  const terminal = next === "completed" || next === "declined";
  const { error } = await serviceClient
    .from("projects")
    .update({
      status: next,
      updated_at: new Date().toISOString(),
      // Stamped once, on the decision that ends the enquiry. Re-opening a
      // completed project deliberately keeps the original decision time.
      ...(terminal && !project.decided_at
        ? { decided_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", projectId)
    .eq("artist_id", artistId);

  if (error) return { ok: false, error: "Couldn't save. Try again." };
  return { ok: true };
}

/** Save the artist's private working note. Never shown to the client. */
export async function saveProjectNoteCore(
  artistId: string,
  projectId: string,
  note: unknown,
): Promise<ProjectMutationResult> {
  const text =
    typeof note === "string" ? note.trim().slice(0, PROJECT_NOTE_MAX) : "";
  const { error, count } = await serviceClient
    .from("projects")
    .update(
      { artist_note: text || null, updated_at: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("id", projectId)
    .eq("artist_id", artistId);

  if (error) return { ok: false, error: "Couldn't save. Try again." };
  if (!count)
    return { ok: false, error: "Project not found.", code: "not_found" };
  return { ok: true };
}

/**
 * Link an existing booking request to a project, or unlink it (`null`).
 *
 * Both sides are ownership-checked in the same statement rather than read
 * first: a booking belonging to another artist must not become attachable by
 * guessing an id.
 */
export async function linkBookingToProjectCore(
  artistId: string,
  bookingId: string,
  projectId: string | null,
): Promise<ProjectMutationResult> {
  if (projectId !== null) {
    const project = await loadProject(artistId, projectId);
    if (!project) {
      return { ok: false, error: "Project not found.", code: "not_found" };
    }
  }

  const { error, count } = await serviceClient
    .from("booking_requests")
    .update({ project_id: projectId }, { count: "exact" })
    .eq("id", bookingId)
    .eq("artist_id", artistId);

  if (error) return { ok: false, error: "Couldn't save. Try again." };
  if (!count)
    return { ok: false, error: "Booking not found.", code: "not_found" };
  return { ok: true };
}

/** Signed URLs for a project's media. Short-lived, generated per render: the
 *  bucket is private and these are body photographs. */
export async function signProjectMedia(
  paths: string[],
  expiresInSeconds = 60 * 10,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await serviceClient.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}
