import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";

export type ContentReportInput = {
  category: string;
  url: string;
  description: string;
  reporterName: string;
  reporterEmail: string;
  reference: string;
};

/**
 * Insert a durable moderation-queue row for a /legal/report submission
 * (`content_reports`, migration 0155). This is the RECORD OF RECORD for DSA
 * notice-and-action: counsel's Q16 element (2) requires "a queued item in the
 * moderation workflow", which an email notification is not.
 *
 * Best-effort, by the same posture the emails already use: a write failure is
 * logged LOUDLY (a lost report is a compliance gap, not a nuisance) but must
 * NOT fail the reporter, whose acknowledgement and the operator email still go.
 * Written as `serviceClient`; `content_reports` is RLS-enabled with zero
 * policies, so no user-scoped client could write it.
 */
export async function queueContentReport(
  input: ContentReportInput,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await serviceClient
    .from("content_reports")
    .insert({
      category: input.category,
      url: input.url,
      description: input.description,
      reporter_name: input.reporterName,
      reporter_email: input.reporterEmail,
      reference: input.reference,
    })
    .select("id")
    .single();
  if (error) {
    Sentry.captureException(error, {
      level: "error",
      tags: { area: "dsa", op: "queueContentReport" },
      extra: { reference: input.reference, category: input.category },
    });
    console.error("[dsa report] content_reports queue write failed", error);
    return { error: error.message };
  }
  return { id: data.id };
}
