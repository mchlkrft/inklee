import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  projectIntakeSchema,
  validateBudgetRange,
  canTransitionProject,
  isProjectStatus,
  PROJECT_MAX_IMAGES,
  PROJECT_MAX_IMAGE_BYTES,
  PROJECT_MAX_TOTAL_BYTES,
  PROJECT_NOTE_MAX,
  PROJECT_SCALES,
  BODY_AREAS,
  labelForKey,
  type ProjectRecord,
  type ProjectStatus,
} from "@inklee/shared/projects";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { largeProjectsAllowed } from "./entitlement-gates";
import { processImage } from "@/lib/image-processing";
import { createNotification } from "@/lib/notifications";
import { appOrigin, projectPortalUrl } from "@/lib/public-url";
import {
  PROJECT_MEDIA_BUCKET,
  projectMediaFolder,
} from "./project-media-storage";
import {
  sendProjectReceivedClient,
  sendProjectReceivedArtist,
  sendProjectStatusClient,
  clientNotifiableStatus,
} from "@/lib/email/project-emails";

// Server cores for large-project mode (Plus build P4).
//
// Everything that writes a project goes through here, so the public intake,
// the web artist actions and the mobile routes cannot drift. The RLS posture
// (0115) gives the artist SELECT only; every write below runs service-role
// AFTER an explicit ownership or entitlement check, matching the 0080 house
// convention, because RLS cannot express "this transition is legal" or "this
// artist may create projects at all".

export type ProjectSubmitResult =
  | { ok: true; projectId: string; portalToken: string }
  | { ok: false; error: string; field?: string };

/** Where project media lives. The existing private `bookings` bucket under a
 *  `projects/` prefix: same kind of object, same lifecycle, so no second
 *  bucket, policy set or cleanup job is introduced to hold it.
 *
 *  The bucket and prefix come from `project-media-storage.ts` rather than
 *  being literals here, because the LO-5 DPIA R6 retention purge
 *  (`intake-retention.ts`) has to delete exactly what this writes. A purge
 *  pointed at a stale prefix reports a clean zero forever while the
 *  photographs it exists to remove stay in the bucket. */
const MEDIA_BUCKET = PROJECT_MEDIA_BUCKET;
const mediaPath = (artistId: string, projectId: string) =>
  `${projectMediaFolder(artistId, projectId)}${crypto.randomUUID()}.webp`;

// MIME allowlist (ABUSE-PUB-001). The size caps below stop an oversized
// upload but say nothing about *kind* — without this, an arbitrary file is
// handed straight to sharp. Same three types the booking intake accepts
// (apps/web/src/app/[slug]/actions.ts).
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** A request fingerprint for the dedupe window below, mirroring the booking
 *  intake's buildBookingFingerprintKey (packages/shared/src/booking-domain.ts):
 *  compare a handful of fields instead of email alone, so a doubled network
 *  retry or an impatient double-click cannot create two enquiries. */
function projectFingerprintKey(input: {
  customerEmail: string | null | undefined;
  customerHandle?: string | null;
  title: string | null | undefined;
  scale: string | null | undefined;
}): string {
  return [
    (input.customerEmail ?? "").trim().toLowerCase(),
    (input.customerHandle ?? "").trim().toLowerCase(),
    (input.title ?? "").trim().toLowerCase(),
    input.scale ?? "",
  ].join("|");
}

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

  // MIME allowlist before anything is handed to sharp (ABUSE-PUB-001).
  const disallowedType = realImages.find(
    (f) => !ALLOWED_IMAGE_TYPES.includes(f.type),
  );
  if (disallowedType) {
    return {
      ok: false,
      error: "Photos must be JPG, PNG, or WebP.",
      field: "images",
    };
  }

  // The client checks these too, so a visitor can correct a photo while they
  // still have the file picker open. This is the enforcement copy: a crafted
  // post, or a stale page, must not be able to hand `processImage` an
  // arbitrarily large buffer.
  const oversized = realImages.find((f) => f.size > PROJECT_MAX_IMAGE_BYTES);
  if (oversized) {
    return {
      ok: false,
      error: "One of the photos is too large. Pick a smaller version.",
      field: "images",
    };
  }
  const totalBytes = realImages.reduce((n, f) => n + f.size, 0);
  if (totalBytes > PROJECT_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: "Those photos add up to too much. Send fewer, or smaller ones.",
      field: "images",
    };
  }

  // Deduplication (ABUSE-PUB-001): compare a request fingerprint over a
  // 60-second window, same shape and window as the booking intake's dedupe
  // (apps/web/src/app/[slug]/actions.ts). Scoped to this artist only.
  const dedupeWindow = new Date(Date.now() - 60000).toISOString();
  const requestFingerprint = projectFingerprintKey({
    customerEmail: data.customerEmail,
    customerHandle: data.customerHandle,
    title: data.title,
    scale: data.scale,
  });
  const { data: recentProjects } = await serviceClient
    .from("projects")
    .select("customer_email, customer_handle, title, scale")
    .eq("artist_id", artistId)
    .gte("created_at", dedupeWindow);

  const duplicate = (recentProjects ?? []).some(
    (row) =>
      projectFingerprintKey({
        customerEmail: row.customer_email as string | null,
        customerHandle: row.customer_handle as string | null,
        title: row.title as string | null,
        scale: row.scale as string | null,
      }) === requestFingerprint,
  );
  if (duplicate) {
    return {
      ok: false,
      error:
        "Your enquiry was already submitted. Check your email for confirmation.",
    };
  }

  // Client portal token (P4 follow-up). Only the hash is stored, exactly like
  // the booking portal (0004): the database never holds a credential that
  // would grant access if it leaked, and the plaintext lives only in the email
  // that carries it.
  const crypto = await import("crypto");
  const portalToken = crypto.randomBytes(32).toString("hex");
  const portalTokenHash = crypto
    .createHash("sha256")
    .update(portalToken)
    .digest("hex");

  const { data: inserted, error: insertError } = await serviceClient
    .from("projects")
    .insert({
      artist_id: artistId,
      customer_token_hash: portalTokenHash,
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

  // Tell both sides. Best-effort by design: the project record is the thing
  // that matters, and an email-provider outage must not fail an intake the
  // client already completed. Failures are logged inside each sender.
  await notifyProjectSubmitted({
    artistId,
    projectId,
    portalToken,
    title: data.title,
    customerEmail: data.customerEmail,
    customerHandle: data.customerHandle ?? null,
    scale: data.scale,
    bodyAreas: data.bodyAreas,
  });

  return { ok: true, projectId, portalToken };
}

/** The intake fan-out: an in-app notification plus one email each way. */
async function notifyProjectSubmitted(args: {
  artistId: string;
  projectId: string;
  portalToken: string;
  title: string;
  customerEmail: string;
  customerHandle: string | null;
  scale: string;
  bodyAreas: string[];
}): Promise<void> {
  try {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("display_name, email")
      .eq("id", args.artistId)
      .single();
    const artistName =
      (profile?.display_name as string | null) ?? "your artist";
    const clientLabel = args.customerHandle
      ? `@${args.customerHandle.replace(/^@/, "")}`
      : args.customerEmail;

    await createNotification({
      artistId: args.artistId,
      type: "booking_request",
      category: "booking_activity",
      priority: "high",
      title: "New project enquiry",
      message: `${clientLabel} sent a project enquiry: ${args.title}`,
      ctaLabel: "Open the project",
      ctaHref: `/bookings/projects/${args.projectId}`,
      metadata: { project_id: args.projectId },
    });

    await sendProjectReceivedClient({
      to: args.customerEmail,
      artistName,
      projectTitle: args.title,
      portalUrl: projectPortalUrl(args.portalToken),
    });

    const artistEmail = profile?.email as string | null | undefined;
    if (artistEmail) {
      await sendProjectReceivedArtist({
        to: artistEmail,
        projectTitle: args.title,
        clientLabel,
        scaleLabel: labelForKey(PROJECT_SCALES, args.scale),
        areasLabel:
          args.bodyAreas
            .map((a) => labelForKey(BODY_AREAS, a))
            .filter(Boolean)
            .join(", ") || null,
        projectUrl: `${appOrigin()}/bookings/projects/${args.projectId}`,
      });
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "project_intake_notify" },
      extra: { projectId: args.projectId },
    });
  }
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

  // Tell the client, but only about transitions that mean something to them,
  // and only ONCE per status. `client_notified_status` is what makes the
  // second half true: without it, moving active -> consultation -> active
  // would email twice about the same thing.
  await notifyProjectStatus(project, next);

  return { ok: true };
}

async function notifyProjectStatus(
  project: ProjectRecord,
  next: ProjectStatus,
): Promise<void> {
  if (!clientNotifiableStatus(next)) return;
  if (project.client_notified_status === next) return;
  if (!project.customer_token_hash) return; // pre-portal project, no link to send

  try {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("display_name")
      .eq("id", project.artist_id)
      .single();

    // The plaintext token is not recoverable from its hash, by design, so the
    // email cannot re-send the original link. It ROTATES instead, exactly like
    // the booking portal does on deposit payment: a fresh token goes out with
    // this email and the previous one stops working. One live link at a time
    // is also the safer property, since these emails accumulate in an inbox.
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(token).digest("hex");

    // Rotate BEFORE sending. If the update fails we have not yet promised the
    // client a link that would not resolve; if the send fails afterwards, the
    // worst case is a working link nobody received, and the next transition
    // issues another.
    const { error: rotateError } = await serviceClient
      .from("projects")
      .update({ customer_token_hash: hash, client_notified_status: next })
      .eq("id", project.id);
    if (rotateError) return;

    await sendProjectStatusClient({
      to: project.customer_email,
      artistName: (profile?.display_name as string | null) ?? "Your artist",
      projectTitle: project.title,
      status: next,
      portalUrl: projectPortalUrl(token),
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "project_status_notify" },
      extra: { projectId: project.id, status: next },
    });
  }
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
