import type { QueryClient } from "@tanstack/react-query";
import { apiPost } from "./api";

// The notifications feed + the unread badge share this queryKey, so marking
// read and invalidating it refreshes both the badge and the list at once.
const NOTIFICATIONS_KEY = ["api", "/notifications"];

export function markNotificationsRead(ids: string[]) {
  return apiPost<{ updated: number }>("/notifications/read", { ids });
}

export function markAllNotificationsRead() {
  return apiPost<{ ok: true }>("/notifications/read-all");
}

// Resolve a system warning (sets is_resolved + is_read), mirroring the web
// resolveWarningAction so a warning can be cleared from the app, not just the web.
export function resolveNotificationWarning(id: string) {
  return apiPost<{ ok: true }>("/notifications/resolve", { id });
}

export function invalidateNotifications(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
}
