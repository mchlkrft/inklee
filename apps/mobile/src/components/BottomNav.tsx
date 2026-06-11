import { Pressable, View } from "react-native";
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
import { chrome } from "@/lib/theme";

// Bottom padding scrollable tab content needs so its tail isn't hidden under
// the floating pill (the nav OVERLAYS content instead of reserving a band).
export const TAB_BAR_CLEARANCE = 120;

// Per-route icon (Flash uses the brand Spiderweb). Mirrors the web
// MOBILE_BOTTOM_NAV order: Dashboard, Flash, Bookings (center), Guest Spots,
// Goods. Icons only — no labels (founder direction): larger glyphs carry it.
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

// Custom tab bar — a floating dark pill OVERLAYING the content (absolute,
// transparent band: no bone/charcoal layer behind it). The middle slot
// (Bookings) is a raised FAB: mustard when active, rosa when idle, ringed in
// the pill colour so it cuts cleanly. Icons only, sized up.
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const centerIndex = Math.floor(state.routes.length / 2);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "transparent",
        // Same 16px breathing room as the mx-4 side gaps (founder direction):
        // the pill hugs the bottom edge instead of floating high above it.
        paddingBottom: 16,
      }}
    >
      <View
        className="mx-4 flex-row items-end justify-between rounded-full px-3 py-2.5"
        style={{
          backgroundColor: chrome.bg,
          borderWidth: border.hairline,
          borderColor: chrome.border,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 10,
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
                className="flex-1 items-center"
              >
                <View
                  className="h-[72px] w-[72px] items-center justify-center rounded-full"
                  style={{
                    marginTop: -40,
                    backgroundColor: focused ? brand.mustard : brand.rosa,
                    borderWidth: 4,
                    borderColor: chrome.bg,
                  }}
                >
                  <Icon
                    size={34}
                    color={brand.charcoal}
                    strokeWidth={focused ? 2.2 : 2}
                  />
                </View>
              </Pressable>
            );
          }

          const iconColor = focused ? brand.charcoal : chrome.mutedFg;
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              className="h-12 flex-1 items-center justify-center rounded-full"
              style={focused ? { backgroundColor: brand.rosa } : undefined}
            >
              {isFlash ? (
                <Spiderweb size={26} color={iconColor} />
              ) : (
                <Icon
                  size={26}
                  color={iconColor}
                  strokeWidth={focused ? 2 : 1.7}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
