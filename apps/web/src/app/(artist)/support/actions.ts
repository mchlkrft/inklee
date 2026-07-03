"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  validateTicketInput,
  validateReplyBody,
  isSupportCategory,
  type SupportTicketInput,
  type SupportCategory,
} from "@/lib/support";
import { createSupportTicket, addArtistReply } from "@/lib/server/support";
import { UUID_RE } from "@/lib/mobile-booking-form";

type State = { error: string } | { ok: true } | null;

export async function createTicketAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "Not authenticated." };

  const str = (k: string) => ((formData.get(k) as string) ?? "").trim();
  const input: SupportTicketInput = {
    subject: str("subject"),
    category: str("category"),
    description: str("description"),
    expectedBehavior: str("expected_behavior"),
    actualBehavior: str("actual_behavior"),
    reproductionSteps: str("reproduction_steps"),
    relevantArea: str("relevant_area"),
    deviceInfo: str("device_info"),
    platformInfo: str("platform_info"),
    additionalContext: str("additional_context"),
  };

  const validationError = validateTicketInput(input);
  if (validationError) return { error: validationError };
  if (!isSupportCategory(input.category)) return { error: "Pick a category." };

  const result = await createSupportTicket({
    artistId: user.id,
    artistEmail: user.email,
    input: input as SupportTicketInput & { category: SupportCategory },
  });
  if ("error" in result) return { error: result.error };

  redirect(`/support/${result.id}?created=1`);
}

export async function replyToTicketAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "Not authenticated." };

  const ticketId = (formData.get("ticket_id") as string) ?? "";
  const body = ((formData.get("body") as string) ?? "").trim();
  if (!UUID_RE.test(ticketId)) return { error: "Ticket not found." };

  const bodyError = validateReplyBody(body);
  if (bodyError) return { error: bodyError };

  const result = await addArtistReply({
    ticketId,
    artistId: user.id,
    artistEmail: user.email,
    body,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/support/${ticketId}`);
  return { ok: true };
}
