import {
  Inbox,
  LayoutDashboard,
  MapPin,
  ShoppingBag,
} from "lucide-react-native";
import type { LucideIcon } from "@/lib/icon-types";

// Shared tab-destination vocabulary for BOTH nav chromes (BottomNav pill on
// compact/medium, NavRail on expanded) — one source of truth, mirroring the
// web MOBILE_BOTTOM_NAV order: Dashboard, Flash, Bookings (center), Guest
// Spots, Goods. Flash renders the brand Spiderweb instead of a lucide glyph.
export const NAV_ICONS: Record<string, LucideIcon> = {
  index: LayoutDashboard,
  bookings: Inbox,
  travel: MapPin,
  goods: ShoppingBag,
};

export const NAV_LABELS: Record<string, string> = {
  index: "Dashboard",
  flash: "Flash",
  bookings: "Bookings",
  travel: "Guest Spots",
  goods: "Goods",
};
