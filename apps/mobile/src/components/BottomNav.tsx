import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  Inbox,
  LayoutDashboard,
  MapPin,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react-native";
import { Spiderweb } from "./icons/Spiderweb";
import { border, colors as brand } from "@/lib/tokens";
import { useThemeColors } from "@/lib/theme";

// Per-route lucide icon (Flash uses the brand Spiderweb instead). Mirrors the web
// MOBILE_BOTTOM_NAV order: Dashboard, Flash, Bookings (center), Guest Spots, Goods.
const ICONS: Record<string, LucideIcon> = {
  index: LayoutDashboard,
  bookings: Inbox,
  travel: MapPin,
  goods: ShoppingBag,
};
const LABELS: Record<string, string> = {
  index: "Dashboard",
  flash: "Flash",
  bookings: "Bookings",
  travel: "Guest Spots",
  goods: "Goods",
};

// Custom tab bar — a floating themed pill mirroring the web mobile-bottom-nav.tsx.
// The middle slot (Bookings) is a raised FAB: mustard when active, rosa when idle,
// ringed in the band colour so it cuts cleanly out of the pill (MB-13: +15% size).
// Flash carries the brand Spiderweb. Non-center tabs fill a rosa pill when active.
// The bar reserves its own height so scene content never slides under it.
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const centerIndex = Math.floor(state.routes.length / 2);

  return (
    <View
      style={{
        backgroundColor: theme.background,
        paddingTop: 4,
        paddingBottom: insets.bottom + 12,
      }}
    >
      <View
        className="mx-3 flex-row items-end justify-between rounded-full px-2 py-2"
        style={{
          backgroundColor: theme.chrome,
          borderWidth: border.hairline,
          borderColor: theme.border,
          shadowColor: "#000",
          shadowOpacity: 0.16,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        {state.routes.map((route, idx) => {
          const focused = state.index === idx;
          const label = LABELS[route.name] ?? route.name;
          const isCenter = idx === centerIndex;
          const isFlash = route.name === "flash";
          const Icon = ICONS[route.name] ?? LayoutDashboard;

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
                accessibilityLabel={label}
                className="flex-1 items-center gap-1"
              >
                <View
                  className="h-16 w-16 items-center justify-center rounded-full"
                  style={{
                    marginTop: -32,
                    backgroundColor: focused ? brand.mustard : brand.rosa,
                    borderWidth: 4,
                    borderColor: theme.background,
                  }}
                >
                  <Icon
                    size={27}
                    color={brand.charcoal}
                    strokeWidth={focused ? 2.2 : 2}
                  />
                </View>
                <Text
                  className="text-[11px]"
                  style={{
                    color: focused ? brand.rosa : theme.mutedForeground,
                    fontWeight: focused ? "500" : "400",
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          }

          const iconColor = focused ? brand.charcoal : theme.mutedForeground;
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              className="flex-1 items-center justify-center gap-1 rounded-full py-1.5"
              style={focused ? { backgroundColor: brand.rosa } : undefined}
            >
              {isFlash ? (
                <Spiderweb size={18} color={iconColor} />
              ) : (
                <Icon
                  size={18}
                  color={iconColor}
                  strokeWidth={focused ? 2 : 1.6}
                />
              )}
              <Text
                className="text-[11px]"
                style={{
                  color: iconColor,
                  fontWeight: focused ? "500" : "400",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
