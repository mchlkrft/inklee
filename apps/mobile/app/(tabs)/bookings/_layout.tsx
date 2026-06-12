import { Stack, usePathname, useRouter } from "expo-router";
import { View } from "react-native";
import { CalendarDays, Inbox, Users } from "lucide-react-native";
import { TopBar, useTopBarHeight } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { SubNav } from "@/components/SubNav";
import { useTopBarReset } from "@/lib/scroll-hide";
import { useThemeColors } from "@/lib/theme";

// The three Bookings sub-views, each a sibling route under (tabs)/bookings.
// Icons mirror the web nav vocabulary (nav-config.ts: Inbox for Bookings,
// CalendarDays + Users re-exported for exactly these sub-surfaces).
const SUBNAV = [
  { label: "Requests", path: "/bookings", icon: Inbox },
  { label: "Calendar", path: "/bookings/calendar", icon: CalendarDays },
  { label: "Clients", path: "/bookings/clients", icon: Users },
] as const;

// Bookings tab shell: the floating TopBar, a "Bookings" title, and a segmented
// sub-nav (Requests / Calendar / Clients) above a nested Stack — the native
// take on the web bookings/overview tab strip. The chips router.replace between
// the sibling routes (animation "none" = instant swap, no back-stack buildup).
// Booking + client detail screens are pushed top-level over the tabs with
// native back headers (root _layout: bookings/[id], clients/[email]).
export default function BookingsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useThemeColors();
  const topBarHeight = useTopBarHeight();
  // This layout mounts the TopBar but never scroll-hides it, so it must reset
  // the shared progress on focus — otherwise a bar hidden on another tab
  // arrives here stranded off-screen with no scroll handler to reveal it.
  useTopBarReset();

  return (
    <View className="flex-1 bg-background">
      {/* The PageHeader + sub-nav are static here, so the bookings screens do
          NOT drive the scroll-hide (the bar stays put; no orphaned gap). */}
      <View className="px-5" style={{ paddingTop: topBarHeight }}>
        <PageHeader title="Bookings" />
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
      <View className="flex-1">
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "none",
            contentStyle: { backgroundColor: theme.background },
          }}
        />
      </View>
      <TopBar />
    </View>
  );
}
