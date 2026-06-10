import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  MapPin,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react-native";
import { border, colors } from "@/lib/tokens";

// Per-route icon + label, keyed by the (tabs) route names. Mirrors the web
// MOBILE_BOTTOM_NAV order: Dashboard, Flash, Bookings (center), Guest Spots,
// Goods (nav-config.ts).
const TABS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: LayoutDashboard, label: "Dashboard" },
  flash: { icon: LayoutGrid, label: "Flash" },
  bookings: { icon: Inbox, label: "Bookings" },
  travel: { icon: MapPin, label: "Guest Spots" },
  goods: { icon: ShoppingBag, label: "Goods" },
};

// Custom tab bar — a floating dark pill mirroring the web mobile-bottom-nav.tsx.
// The middle slot (Bookings) is raised as an accented FAB: mustard when active,
// rosa when idle, ringed in the band colour so it cuts cleanly out of the pill
// (the web's ring-4 cut-out). Non-center tabs fill a rosa pill when active. The
// bar reserves its own height, so scene content never slides under it (a clean
// native take on the web's fixed/overlapping floating nav).
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const centerIndex = Math.floor(state.routes.length / 2);

  return (
    <View
      style={{
        backgroundColor: colors.charcoal,
        paddingTop: 4,
        paddingBottom: insets.bottom + 12,
      }}
    >
      <View
        className="mx-3 flex-row items-end justify-between rounded-full px-2 py-2"
        style={{
          backgroundColor: "rgba(229,225,213,0.06)",
          borderWidth: border.hairline,
          borderColor: colors.shell.border,
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        {state.routes.map((route, idx) => {
          const focused = state.index === idx;
          const meta = TABS[route.name] ?? {
            icon: LayoutDashboard,
            label: route.name,
          };
          const Icon = meta.icon;
          const isCenter = idx === centerIndex;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (isCenter) {
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={meta.label}
                className="flex-1 items-center gap-1"
              >
                <View
                  className="h-14 w-14 items-center justify-center rounded-full"
                  style={{
                    marginTop: -28,
                    backgroundColor: focused ? colors.mustard : colors.rosa,
                    borderWidth: 4,
                    borderColor: colors.charcoal,
                  }}
                >
                  <Icon
                    size={24}
                    color={colors.charcoal}
                    strokeWidth={focused ? 2.2 : 2}
                  />
                </View>
                <Text
                  className="text-[11px]"
                  style={{
                    color: focused ? colors.rosa : colors.shell.dim,
                    fontWeight: focused ? "500" : "400",
                  }}
                >
                  {meta.label}
                </Text>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              className="flex-1 items-center justify-center gap-1 rounded-full py-1.5"
              style={focused ? { backgroundColor: colors.rosa } : undefined}
            >
              <Icon
                size={18}
                color={focused ? colors.charcoal : colors.shell.dim}
                strokeWidth={focused ? 2 : 1.6}
              />
              <Text
                className="text-[11px]"
                style={{
                  color: focused ? colors.charcoal : colors.shell.dim,
                  fontWeight: focused ? "500" : "400",
                }}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
