import { Tabs } from "expo-router";
import { BottomNav } from "@/components/BottomNav";

// 5-tab artist nav mirroring the web MOBILE_BOTTOM_NAV (nav-config.ts):
// Dashboard, Flash, Bookings (raised center FAB), Guest Spots, Goods. The tab
// bar is the custom BottomNav; the top chrome is the floating TopBar, which the
// tab-root SCREENS render themselves as an absolute overlay (best-practice
// scrolling header — content scrolls under it, hiding animates transform only).
// Declaration order sets the bar order, so Bookings sits at the center slot.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomNav {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="flash" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="travel" />
      <Tabs.Screen name="goods" />
    </Tabs>
  );
}
