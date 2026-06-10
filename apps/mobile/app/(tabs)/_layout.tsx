import { Tabs } from "expo-router";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";

// 5-tab artist nav mirroring the web MOBILE_BOTTOM_NAV (nav-config.ts):
// Dashboard, Flash, Bookings (raised center FAB), Guest Spots, Goods. The tab
// bar is the custom BottomNav; the top chrome is the floating TopBar. The
// dashboard is a single screen, so it takes the TopBar as its tab header; the
// flash / bookings / travel / goods tabs are nested layouts that render the
// TopBar themselves (stack-index header or in-content), hence headerShown:false.
// Declaration order sets the bar order, so Bookings sits at the center slot.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomNav {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{ headerShown: true, header: () => <TopBar /> }}
      />
      <Tabs.Screen name="flash" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="travel" />
      <Tabs.Screen name="goods" />
    </Tabs>
  );
}
