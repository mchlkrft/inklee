import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useApiQuery } from "@/lib/api";
import { chrome } from "@/lib/theme";
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
      className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
    >
      <Ionicons name="notifications-outline" size={24} color={chrome.fg} />
      {unread > 0 ? (
        // MB-13: 18px circle, ring in the dark chrome colour so it cuts cleanly
        // off the bell. The count is vertically centred with an explicit
        // lineHeight + includeFontPadding:false (Android) so it isn't low.
        <View
          className="absolute right-0.5 top-0.5 h-[18px] min-w-[18px] items-center justify-center rounded-full border bg-rosa px-1"
          style={{ borderColor: chrome.bg }}
        >
          <Text
            className="text-[10px] font-bold text-charcoal"
            style={{
              lineHeight: 12,
              includeFontPadding: false,
              textAlignVertical: "center",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
