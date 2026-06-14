import { useState } from "react";
import { Stack, usePathname, useRouter } from "expo-router";
import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { CalendarDays, Inbox, Users, Wallet } from "lucide-react-native";
import { TopBar, useTopBarHeight } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { SubNav } from "@/components/SubNav";
import { topBarProgress, useTopBarReset } from "@/lib/scroll-hide";
import { BookingsHeaderInsetContext } from "@/lib/bookings-header";
import { useThemeColors } from "@/lib/theme";

// The three Bookings sub-views, each a sibling route under (tabs)/bookings.
// Icons mirror the web nav vocabulary (nav-config.ts: Inbox for Bookings,
// CalendarDays + Users re-exported for exactly these sub-surfaces).
const SUBNAV = [
  { label: "Requests", path: "/bookings", icon: Inbox },
  { label: "Calendar", path: "/bookings/calendar", icon: CalendarDays },
  { label: "Clients", path: "/bookings/clients", icon: Users },
  { label: "Deposits", path: "/bookings/deposits", icon: Wallet },
] as const;

// How far the pinned band rises when the TopBar scroll-hides: the pill row it
// sits under (12 band padding + 64 pill + 8 tail) minus the 12px it keeps
// below the status inset. The freed space shows the content scrolling under.
const BAND_RAISE = 72;

// Rough title + sub-nav height until the first onLayout measures it.
const BAND_ESTIMATE = 96;

// Bookings tab shell: the floating TopBar, a pinned "Bookings" title +
// segmented sub-nav (Requests / Calendar / Clients) band, and a nested Stack
// the sub-screens scroll inside — the native take on the web bookings tab
// strip. The chips router.replace between sibling routes (animation "none" =
// instant swap, no back-stack buildup). Unlike the other tabs the band stays
// pinned (the sub-nav is the section switcher), but it rises with the
// scroll-hiding TopBar so the pill's space is reclaimed like everywhere else
// (founder round 8). The sub-screens drive topBarProgress via useScrollHide
// and pad their scroll content by useBookingsHeaderInset(). Booking + client
// detail screens are pushed top-level over the tabs with native back headers
// (root _layout: bookings/[id], clients/[email]).
export default function BookingsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useThemeColors();
  const topBarHeight = useTopBarHeight();
  const [bandHeight, setBandHeight] = useState(BAND_ESTIMATE);
  // Safety net: the sub-screens reset the bar via useScrollHide, but a future
  // sub-screen without a scroll handler must not strand a hidden bar.
  useTopBarReset();

  const raise = useAnimatedStyle(() => ({
    transform: [{ translateY: -topBarProgress.value * BAND_RAISE }],
  }));

  return (
    <View className="flex-1 bg-background">
      <BookingsHeaderInsetContext.Provider value={topBarHeight + bandHeight}>
        <View className="flex-1">
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "none",
              contentStyle: { backgroundColor: theme.background },
            }}
          />
        </View>
      </BookingsHeaderInsetContext.Provider>
      {/* Pinned band: solid background so list content disappears beneath it;
          sits under the TopBar (zIndex 40) and the status lens (39). */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 30,
            backgroundColor: theme.background,
            paddingTop: topBarHeight,
          },
          raise,
        ]}
      >
        <View
          className="px-5"
          onLayout={(e) =>
            setBandHeight(Math.round(e.nativeEvent.layout.height))
          }
        >
          <PageHeader title="Bookings" icon={Inbox} iconRole="mustard" />
          <View className="mb-3">
            <SubNav
              items={SUBNAV}
              activePath={pathname}
              onSelect={(path) => {
                if (pathname !== path) router.replace(path);
              }}
            />
          </View>
        </View>
      </Animated.View>
      <TopBar />
    </View>
  );
}
