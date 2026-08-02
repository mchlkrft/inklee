"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import { submitProjectIntakeCore } from "@/lib/server/projects";
import { PROJECT_MAX_IMAGES } from "@inklee/shared/projects";
import { projectPortalUrl } from "@/lib/public-url";
import { checkProjectIntakeRateLimit } from "@/lib/ratelimit";
import { isAllowedBookingOrigin } from "@/lib/host";
import { HONEYPOT_FIELD, isHoneypotTriggered } from "@/lib/honeypot";

type State = { error: string; field?: string } | null;

/** Numbers arrive as strings from a form; an empty field means "not answered",
 *  which for a budget is a real answer and must not become 0. */
function euroToCents(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export async function submitProjectIntakeAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  // Honeypot check — silently succeed so bots don't know they were blocked.
  // Mirrors the booking intake's control (apps/web/src/app/[slug]/actions.ts):
  // a distinguishable refusal here would teach a bot which field trips it.
  if (isHoneypotTriggered(formData.get(HONEYPOT_FIELD))) return null;

  // Origin check — same acceptance rule as the booking form: the canonical
  // app host plus artist bio-domain subdomains, since this form is served on
  // both and once *.inkl.ee subdomain mode is live a stricter check would
  // reject real submissions.
  const headersList = await headers();
  if (
    !isAllowedBookingOrigin(
      headersList.get("origin"),
      process.env.NEXT_PUBLIC_APP_URL,
    )
  ) {
    return { error: "Invalid request origin." };
  }

  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const slug = (formData.get("slug") as string | null)?.trim().toLowerCase();
  if (!slug) return { error: "Something went wrong. Reload and try again." };

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .eq("account_status", "active")
    .single();
  if (!profile) return { error: "This page is no longer available." };

  // Rate limit — per artist per IP. Tighter than the booking form's own limit
  // (see lib/ratelimit.ts): this action sends mail to an address the caller
  // supplies and processes up to PROJECT_MAX_IMAGES photos through sharp.
  const { allowed } = await checkProjectIntakeRateLimit(
    ip,
    profile.id as string,
  );
  if (!allowed) {
    return {
      error: "Too many requests. Please wait before submitting again.",
    };
  }

  const images = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File)
    .slice(0, PROJECT_MAX_IMAGES);

  const result = await submitProjectIntakeCore(
    profile.id as string,
    {
      title: formData.get("title") ?? "",
      description: formData.get("description") ?? "",
      longTermGoal: formData.get("longTermGoal") ?? undefined,
      bodyAreas: formData.getAll("bodyAreas").map(String),
      coverage: (formData.get("coverage") as string) || undefined,
      availableAreas: formData.get("availableAreas") ?? undefined,
      styles: formData.getAll("styles").map(String),
      scale: formData.get("scale") ?? "",
      sessionCommitment:
        (formData.get("sessionCommitment") as string) || undefined,
      travelAvailability: formData.get("travelAvailability") ?? undefined,
      budgetMinCents: euroToCents(formData.get("budgetMin")),
      budgetMaxCents: euroToCents(formData.get("budgetMax")),
      consultationMethod:
        (formData.get("consultationMethod") as string) || undefined,
      customerEmail: formData.get("customerEmail") ?? "",
      customerHandle: formData.get("customerHandle") ?? undefined,
    },
    images,
  );

  if (!result.ok) return { error: result.error, field: result.field };

  // Straight to their own project page rather than a generic confirmation:
  // the client just spent several minutes on a long intake, and the useful
  // ending is the thing they can come back to. The same link is in their
  // receipt email, so losing this tab costs nothing.
  redirect(projectPortalUrl(result.portalToken));
}
