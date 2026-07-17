import { Tabs } from "expo-router";
import { BottomNav } from "@/components/BottomNav";
import { NavRail } from "@/components/NavRail";
import { useIsExpanded } from "@/lib/layout";

// 5-tab artist nav mirroring the web MOBILE_BOTTOM_NAV (nav-config.ts):
// Dashboard, Flash, Bookings (raised center FAB), Guest Spots, Goods. The tab
// bar is the custom BottomNav; the top chrome is the floating TopBar, which the
// tab-root SCREENS render themselves as an absolute overlay (best-practice
// scrolling header — content scrolls under it, hiding animates transform only).
// Declaration order sets the bar order, so Bookings sits at the center slot.
//
// ME-15: at the expanded window class the chrome switches to a persistent left
// NavRail. tabBarPosition:"left" makes the navigator lay the rail out BEFORE
// the flex:1 screens container (row direction), so the rail structurally
// reserves its column and every screen/overlay/pinned band confines itself to
// the content pane — no per-screen insets. TopBar returns null at expanded
// (its functions live in the rail's bottom cluster).
export default function TabsLayout() {
  const expanded = useIsExpanded();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: expanded ? "left" : "bottom",
      }}
      tabBar={(props) =>
        expanded ? <NavRail {...props} /> : <BottomNav {...props} />
      }
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="flash" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="travel" />
      <Tabs.Screen name="goods" />
    </Tabs>
  );
}
