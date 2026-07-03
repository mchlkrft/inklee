"use server";

import { revalidatePath } from "next/cache";
import { getAdminId } from "@/lib/admin-guard";
import {
  isSupportStatus,
  validateReplyBody,
  type SupportStatus,
} from "@/lib/support";
import { addAdminReply, setTicketStatus } from "@/lib/server/support";
import { UUID_RE } from "@/lib/mobile-booking-form";

type State = { error: string } | { ok: true } | null;

export async function adminReplyAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const ticketId = (formData.get("ticket_id") as string) ?? "";
  const body = ((formData.get("body") as string) ?? "").trim();
  const internal = formData.get("internal") === "1";
  const rawStatus = (formData.get("set_status") as string) ?? "";
  const explicitStatus: SupportStatus | null = isSupportStatus(rawStatus)
    ? rawStatus
    : null;

  if (!UUID_RE.test(ticketId)) return { error: "Ticket not found." };
  const bodyError = validateReplyBody(body);
  if (bodyError) return { error: bodyError };

  const result = await addAdminReply({
    ticketId,
    adminId,
    body,
    explicitStatus,
    internal,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function adminSetStatusAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const ticketId = (formData.get("ticket_id") as string) ?? "";
  const rawStatus = (formData.get("status") as string) ?? "";
  if (!UUID_RE.test(ticketId)) return { error: "Ticket not found." };
  if (!isSupportStatus(rawStatus)) return { error: "Pick a valid status." };

  const result = await setTicketStatus({
    ticketId,
    adminId,
    status: rawStatus,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true };
}
