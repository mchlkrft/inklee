import { serviceClient } from "@/lib/supabase/service";
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

export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  await serviceClient.from("notifications").insert({
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
}
