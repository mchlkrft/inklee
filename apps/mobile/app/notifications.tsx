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
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery } from "@/lib/api";
import {
  invalidateNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/lib/notifications";
import { relativeTime } from "@/lib/date";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";
import type { MobileNotificationsResponse } from "@inklee/shared/mobile-api";
import type { Notification } from "@inklee/shared/notification-types";

const KEY = ["api", "/notifications"];

export default function NotificationsScreen() {
  const router = useRouter();
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
    const bookingId =
      n.metadata && typeof n.metadata.booking_id === "string"
        ? n.metadata.booking_id
        : null;
    if (bookingId) router.push(`/bookings/${bookingId}`);
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
                <Text className="text-sm font-semibold text-mustard">
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
            tintColor={colors.mustard}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.mustard} />
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

function NotificationRow({
  n,
  onPress,
}: {
  n: Notification;
  onPress: () => void;
}) {
  return (
    <View className="mb-2">
      <Card onPress={onPress}>
        <View className="flex-row items-start gap-2">
          <View
            className={`mt-1.5 h-2 w-2 rounded-full ${
              n.is_read ? "" : "bg-rosa"
            }`}
          />
          <View className="flex-1">
            <Text
              className={`text-base ${
                n.is_read
                  ? "font-medium text-shell-dim"
                  : "font-semibold text-foreground"
              }`}
            >
              {n.title}
            </Text>
            <Text className="mt-0.5 text-sm text-shell-dim">{n.message}</Text>
            <Text className="mt-1 text-xs text-shell-mute">
              {relativeTime(n.created_at)}
            </Text>
          </View>
        </View>
      </Card>
    </View>
  );
}
