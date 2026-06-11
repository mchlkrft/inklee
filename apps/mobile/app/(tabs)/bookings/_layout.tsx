import { Stack, usePathname, useRouter } from "expo-router";
import { View } from "react-native";
import { TopBar } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { FilterChip } from "@/components/Chip";
import { useThemeColors } from "@/lib/theme";

// The three Bookings sub-views, each a sibling route under (tabs)/bookings.
const SUBNAV = [
  { label: "Requests", path: "/bookings" },
  { label: "Calendar", path: "/bookings/calendar" },
  { label: "Clients", path: "/bookings/clients" },
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

  return (
    <View className="flex-1 bg-background">
      <TopBar />
      <View className="px-5">
        <PageHeader title="Bookings" />
        <View className="mb-3 flex-row gap-2">
          {SUBNAV.map((item) => (
            <FilterChip
              key={item.path}
              label={item.label}
              selected={pathname === item.path}
              onPress={() => {
                if (pathname !== item.path) router.replace(item.path);
              }}
            />
          ))}
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
    </View>
  );
}
