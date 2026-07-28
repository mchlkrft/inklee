"use server";

import { redirect } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import { submitProjectIntakeCore } from "@/lib/server/projects";
import { PROJECT_MAX_IMAGES } from "@inklee/shared/projects";
import { projectPortalUrl } from "@/lib/public-url";

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
  const slug = (formData.get("slug") as string | null)?.trim().toLowerCase();
  if (!slug) return { error: "Something went wrong. Reload and try again." };

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .eq("account_status", "active")
    .single();
  if (!profile) return { error: "This page is no longer available." };

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
