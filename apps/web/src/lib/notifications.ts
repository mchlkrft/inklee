import { serviceClient } from "@/lib/supabase/service";
import { sendPushToArtist } from "@/lib/server/push";
export type {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
  Notification,
} from "@/lib/notification-types";
export { PRIORITY_ORDER } from "@/lib/notification-types";

type CreateNotificationInput = {
  artistId: string;
  type: import("@/lib/notification-types").NotificationType;
  category: import("@/lib/notification-types").NotificationCategory;
  priority: import("@/lib/notification-types").NotificationPriority;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
  isResolved?: boolean;
  metadata?: Record<string, unknown>;
};

export type NotificationWriteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationWriteResult> {
  const { error } = await serviceClient.from("notifications").insert({
    artist_id: input.artistId,
    type: input.type,
    category: input.category,
    priority: input.priority,
    title: input.title,
    message: input.message,
    cta_label: input.ctaLabel ?? null,
    cta_href: input.ctaHref ?? null,
    is_read: false,
    is_resolved: input.isResolved ?? null,
    metadata: input.metadata ?? null,
  });

  if (error) {
    console.error("[notifications/create]", error.message, {
      artistId: input.artistId,
      type: input.type,
      ctaHref: input.ctaHref ?? null,
    });
    return { ok: false, error: error.message };
  }

  // DRIFT-01: fan the same alert out to the artist's devices via Expo push.
  // Best-effort (never throws); the in-app feed row above is the source of
  // truth, so a push failure does not fail the notification.
  await sendPushToArtist(input.artistId, {
    title: input.title,
    body: input.message,
    data: {
      type: input.type,
      ...(input.ctaHref ? { href: input.ctaHref } : {}),
      ...(input.metadata ?? {}),
    },
  });

  return { ok: true };
}
