"use server";

import { revalidatePath } from "next/cache";
import { getAdminId } from "@/lib/admin-guard";
import {
  takedownGalleryImage,
  type GalleryTakedownResult,
} from "@/lib/server/gallery-takedown";

export type ContentReportActionState =
  | { error: string }
  | { ok: true; result: Extract<GalleryTakedownResult, { ok: true }> }
  | null;

/**
 * Operator action for a gallery-image notice-and-action report (#79 / Q16):
 * remove the reported image and issue the hosting artist the Art. 17 statement.
 * Admin-guarded like the map admin actions. The operator identifies the
 * content_reports row, the hosting artist, and the specific hosted image URL
 * (deciding the report is founded is the human moderation step, not automated).
 */
export async function takedownGalleryImageAction(
  _prev: ContentReportActionState,
  formData: FormData,
): Promise<ContentReportActionState> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const reportId = String(formData.get("report_id") ?? "").trim();
  const artistId = String(formData.get("artist_id") ?? "").trim();
  const imageUrl = String(formData.get("image_url") ?? "").trim();
  const grounds = String(formData.get("grounds") ?? "").trim() || undefined;

  if (!reportId || !artistId || !imageUrl) {
    return { error: "Report id, artist id and image URL are all required." };
  }

  const result = await takedownGalleryImage({
    reportId,
    artistId,
    imageUrl,
    grounds,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/content-reports");
  return { ok: true, result };
}
