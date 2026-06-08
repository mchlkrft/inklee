import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useApiQuery } from "@/lib/api";
import { colors } from "@/lib/tokens";
import type { MobileNotificationsResponse } from "@inklee/shared/mobile-api";

// Top-bar bell with an unread badge (the plan's notification surface — not a
// tab). Reads the same /notifications query as the feed, so marking read there
// invalidates this badge too (cross-screen freshness via TanStack Query).
export function NotificationBell() {
  const router = useRouter();
  const { data } = useApiQuery<MobileNotificationsResponse>("/notifications");
  const unread = data?.unread ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
      onPress={() => router.push("/notifications")}
      hitSlop={8}
      className="h-10 w-10 items-center justify-center active:opacity-70"
    >
      <Ionicons name="notifications-outline" size={24} color={colors.bone} />
      {unread > 0 ? (
        <View className="absolute right-0.5 top-0.5 h-4 min-w-4 items-center justify-center rounded-full border border-charcoal bg-rosa px-1">
          <Text className="text-[10px] font-bold text-charcoal">
            {unread > 99 ? "99+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
