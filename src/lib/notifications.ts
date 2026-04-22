import { serviceClient } from "@/lib/supabase/service";

export type NotificationCategory =
  | "booking_activity"
  | "client_update"
  | "system_warning"
  | "info";

export type NotificationPriority = "critical" | "high" | "medium" | "low";

export type NotificationType =
  | "booking_request"
  | "booking_approved"
  | "booking_rejected"
  | "booking_cancelled_by_client"
  | "booking_cancelled_by_artist"
  | "deposit_received"
  | "system_warning"
  | "info";

export type Notification = {
  id: string;
  artist_id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  cta_label: string | null;
  cta_href: string | null;
  is_read: boolean;
  is_resolved: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type CreateNotificationInput = {
  artistId: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
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

export const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
