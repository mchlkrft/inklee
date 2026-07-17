import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Menu, LayoutDashboard } from "lucide-react-native";
import { Spiderweb } from "./icons/Spiderweb";
import { IconButton } from "./IconButton";
import { NotificationBell } from "./NotificationBell";
import { BooksStatusPill } from "./BooksStatusPill";
import { AccountMenuSheet } from "./AccountMenuSheet";
import { border, colors as brand } from "@/lib/tokens";
import { chrome } from "@/lib/theme";
import { NAV_ICONS, NAV_LABELS } from "@/lib/nav-items";

export const RAIL_WIDTH = 96;

// Expanded-class nav chrome (ME-15): a persistent left rail replacing BOTH the
// bottom pill and the TopBar overlay. Rendered from the same Tabs `tabBar`
// prop with tabBarPosition:"left", so it structurally RESERVES its column —
// screens shrink automatically, no per-screen inset work. Unlike the pill it
// never hides: it does not overlay content, so the keyboard-up and
// detail-route hide rules do not apply here. Same 5 destinations, same raised
// Bookings FAB identity, same tabPress semantics as BottomNav. The TopBar's
// functions (books status, bell, account menu) live in the bottom cluster;
// the brand mark heads the rail.
export function NavRail({ state, navigation, insets }: BottomTabBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const centerIndex = Math.floor(state.routes.length / 2);

  return (
    <View
      style={{
        width: RAIL_WIDTH + insets.left,
        paddingLeft: insets.left,
      }}
    >
      <View
        className="my-3 ml-3 flex-1 items-center rounded-3xl"
        style={{
          backgroundColor: chrome.bg,
          borderWidth: border.hairline,
          borderColor: chrome.border,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 10,
        }}
      >
        <Spiderweb size={28} color={chrome.fg} />

        <View className="mt-8 items-center gap-2">
          {state.routes.map((route, idx) => {
            const focused = state.index === idx;
            const label = NAV_LABELS[route.name] ?? route.name;
            const isCenter = idx === centerIndex;
            const isFlash = route.name === "flash";
            const Icon = NAV_ICONS[route.name] ?? LayoutDashboard;

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
                  className="items-center py-1"
                >
                  <View
                    className="h-16 w-16 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: focused ? brand.mustard : brand.rosa,
                      borderWidth: 4,
                      borderColor: chrome.bg,
                    }}
                  >
                    <Icon
                      size={30}
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
                className="w-[72px] items-center gap-1 py-1.5"
              >
                <View
                  className="h-11 w-14 items-center justify-center rounded-2xl"
                  style={focused ? { backgroundColor: brand.rosa } : undefined}
                >
                  {isFlash ? (
                    <Spiderweb size={28} color={iconColor} />
                  ) : (
                    <Icon
                      size={24}
                      color={iconColor}
                      strokeWidth={focused ? 2 : 1.7}
                    />
                  )}
                </View>
                <Text
                  className="text-[11px]"
                  style={{ color: focused ? chrome.fg : chrome.mutedFg }}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="flex-1" />

        <View className="items-center gap-3">
          <BooksStatusPill />
          <NotificationBell />
          <IconButton
            icon={Menu}
            label="Account menu"
            onPress={() => setMenuOpen(true)}
            size="md"
            iconSize={22}
            outlined
            borderColor={chrome.border}
            color={chrome.fg}
          />
        </View>

        <AccountMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      </View>
    </View>
  );
}
