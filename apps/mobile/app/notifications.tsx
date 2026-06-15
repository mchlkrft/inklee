import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery } from "@/lib/api";
import {
  invalidateNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/lib/notifications";
import { formatShortDateTime } from "@/lib/date";
import { webHrefToRoute } from "@/lib/push";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import type { MobileNotificationsResponse } from "@inklee/shared/mobile-api";
import type {
  Notification,
  NotificationCategory,
  NotificationPriority,
} from "@inklee/shared/notification-types";

const KEY = ["api", "/notifications"];

export default function NotificationsScreen() {
  const router = useRouter();
  const themed = useColors();
  const queryClient = useQueryClient();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<MobileNotificationsResponse>("/notifications");

  // Optimistically flip is_read locally so the dot + the Home bell badge clear
  // instantly (both read the same query); invalidate to reconcile with server.
  function optimistic(predicate: (n: Notification) => boolean) {
    queryClient.setQueryData<MobileNotificationsResponse>(KEY, (old) => {
      if (!old) return old;
      const items = old.items.map((n) =>
        predicate(n) ? { ...n, is_read: true } : n,
      );
      return { items, unread: items.filter((n) => !n.is_read).length };
    });
  }

  async function markAll() {
    optimistic(() => true);
    try {
      await markAllNotificationsRead();
    } catch (e) {
      captureError(e, { op: "markAllNotificationsRead" });
    } finally {
      void invalidateNotifications(queryClient);
    }
  }

  async function onPress(n: Notification) {
    if (!n.is_read) {
      optimistic((x) => x.id === n.id);
      markNotificationsRead([n.id])
        .catch((e) => captureError(e, { op: "markNotificationsRead" }))
        .finally(() => void invalidateNotifications(queryClient));
    }
    // Route via the booking id when present, else fall back to the web
    // cta_href mapped onto an in-app route — so warnings / client updates that
    // carry only a cta no longer dead-end after marking read. The no-slots
    // warning resolves to the native slots manager directly (its web cta_href
    // points at the whole settings page).
    const bookingId =
      n.metadata && typeof n.metadata.booking_id === "string"
        ? n.metadata.booking_id
        : null;
    const isNoSlotsWarning =
      n.metadata && n.metadata.warning_type === "no_slots_warning";
    const target = bookingId
      ? `/bookings/${bookingId}`
      : isNoSlotsWarning
        ? "/settings/slots"
        : webHrefToRoute(n.cta_href);
    if (target) router.push(target as never);
  }

  const items = data?.items ?? [];
  const hasUnread = (data?.unread ?? 0) > 0;

  return (
    <View className="flex-1 bg-background">
      {/* "Mark all read" lives in the native header — standard placement, big
          target, and no list reflow when it disappears. */}
      <Stack.Screen
        options={{
          headerRight: () =>
            hasUnread ? (
              <Pressable
                accessibilityRole="button"
                onPress={markAll}
                hitSlop={8}
                className="active:opacity-70"
              >
                <Text className="text-sm font-semibold text-accent">
                  Mark all read
                </Text>
              </Pressable>
            ) : null,
        }}
      />

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <NotificationRow n={item} onPress={() => onPress(item)} />
        )}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={themed.accent}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={themed.accent} />
            </View>
          ) : error ? (
            <ErrorState
              title="Couldn't load notifications"
              subtitle={error}
              onRetry={refresh}
            />
          ) : (
            <EmptyState
              title="You're all caught up"
              subtitle="New activity will show up here."
            />
          )
        }
      />
    </View>
  );
}

// Same emoji map as the web bell (notification-bell.tsx CATEGORY_ICON).
const CATEGORY_ICON: Record<NotificationCategory, string> = {
  booking_activity: "📋",
  client_update: "👤",
  system_warning: "⚠️",
  info: "ℹ️",
};

// Web PRIORITY_DOT (red/orange/blue/muted) mapped onto the brand palette.
const PRIORITY_DOT: Record<NotificationPriority, string> = {
  critical: "bg-danger",
  high: "bg-accent",
  medium: "bg-cobalt",
  low: "bg-shell-mute",
};

function NotificationRow({
  n,
  onPress,
}: {
  n: Notification;
  onPress: () => void;
}) {
  // Mirrors the web feed row: rosa/10 tint + "Unread" chip while unread, a
  // "Critical" chip on critical priority, the bell's category emoji + priority
  // dot, an absolute timestamp, and the cta_label as an explicit affordance
  // when the cta resolves to an in-app route (the whole row navigates).
  const showCta = !!n.cta_label && !!webHrefToRoute(n.cta_href);
  return (
    <View className="mb-2">
      {/* Hand-rolled Card motif (rounded-card + brand border) — Card's bg-card
          is fixed, and the unread state needs the surface itself to swap to a
          rosa wash. Conditional whole-class strings avoid tailwind-order
          override pitfalls. */}
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className={`rounded-card border-brand border-shell-border p-5 ${
          n.is_read ? "bg-card" : "bg-rosa/10"
        }`}
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
      >
        <View className="flex-row items-start gap-3">
          <Text className="mt-0.5 text-base">{CATEGORY_ICON[n.category]}</Text>
          <View className="flex-1">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <View
                className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[n.priority]}`}
              />
              <Text
                className={`shrink text-base ${
                  n.is_read
                    ? "font-medium text-shell-dim"
                    : "font-semibold text-foreground"
                }`}
              >
                {n.title}
              </Text>
              {!n.is_read ? (
                <View className="rounded-full bg-rosa px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-charcoal">
                    Unread
                  </Text>
                </View>
              ) : null}
              {n.priority === "critical" ? (
                <View className="rounded-full bg-danger px-2 py-0.5">
                  <Text className="text-[10px] font-semibold uppercase tracking-wide text-bone">
                    Critical
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="mt-0.5 text-sm text-shell-dim">{n.message}</Text>
            <Text className="mt-1 text-xs text-shell-mute">
              {formatShortDateTime(n.created_at)}
            </Text>
            {showCta ? (
              <Text className="mt-2 text-sm font-semibold text-accent">
                {n.cta_label}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
}
