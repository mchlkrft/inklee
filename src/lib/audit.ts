import { serviceClient } from "@/lib/supabase/service";

export type AuditCategory =
  | "booking"
  | "auth"
  | "settings"
  | "admin"
  | "system";

type AuditEntry = {
  bookingId?: string;
  action: string;
  actor?: string;
  category?: AuditCategory;
  details?: Record<string, unknown>;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await serviceClient.from("audit_log").insert({
    booking_id: entry.bookingId ?? null,
    action: entry.action,
    actor: entry.actor ?? null,
    event_category: entry.category ?? "booking",
    details: entry.details ?? {},
  });
}
