import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TopBar } from "@/components/TopBar";
import { colors } from "@/lib/tokens";
import { t } from "@/lib/i18n";

// 5-tab artist nav (Home · Requests · Calendar · Clients · More). The persistent
// top bar (TopBar) carries the wordmark, books-status pill, notification bell,
// and account menu across every tab, mirroring the web mobile-top-bar.tsx.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <TopBar />,
        tabBarActiveTintColor: colors.mustard,
        tabBarInactiveTintColor: colors.shell.mute,
        tabBarStyle: {
          backgroundColor: colors.charcoal,
          borderTopColor: colors.shell.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tab.home"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t("tab.requests"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t("tab.calendar"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t("tab.clients"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("tab.more"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
