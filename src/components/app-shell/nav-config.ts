import {
  LayoutDashboard,
  Inbox,
  MapPin,
  BarChart3,
  Bell,
  Settings,
  CalendarDays,
  Users,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import Spiderweb from "@/components/icons/spiderweb";

export type SubNavItem = {
  label: string;
  href: string;
  match?: string[];
};

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  match?: string[];
  children?: SubNavItem[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const SIDEBAR_NAV: NavGroup[] = [
  {
    label: "General",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        label: "Bookings",
        href: "/bookings/overview",
        icon: Inbox,
        match: ["/bookings"],
        // Waitlist used to be a separate sub-nav item — it's now a tab on
        // /bookings/overview (Requests · Clients · Waitlist). Deposits
        // moved here from /settings/deposits because deposits are part
        // of the booking workflow, not account configuration. Booking
        // Settings (formerly "Books & Availability") sits last as the
        // configuration surface for this group.
        children: [
          { label: "Overview", href: "/bookings/overview" },
          { label: "Calendar", href: "/bookings/calendar" },
          { label: "Deposits", href: "/bookings/deposits" },
          { label: "My Booking Form", href: "/bookings/booking-form" },
          { label: "Booking Settings", href: "/bookings/settings" },
        ],
      },
      {
        label: "Flash",
        href: "/flash",
        icon: Spiderweb,
        match: ["/flash"],
        children: [
          { label: "Designs", href: "/flash/items" },
          { label: "Days", href: "/flash/days" },
          { label: "Instagram", href: "/flash/instagram" },
        ],
      },
      { label: "Goods", href: "/goods", icon: ShoppingBag, match: ["/goods"] },
      { label: "Guest Spots", href: "/travel", icon: MapPin },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Notifications", href: "/notifications", icon: Bell },
      {
        label: "Settings",
        href: "/settings/profile",
        icon: Settings,
        match: ["/settings"],
        children: [
          { label: "Profile", href: "/settings/profile" },
          { label: "Bio page", href: "/settings/bio-page" },
          { label: "Emails", href: "/settings/emails" },
          { label: "Calendar", href: "/settings/calendar" },
          { label: "Home widgets", href: "/settings/dashboard" },
          { label: "Account", href: "/settings/account" },
        ],
      },
    ],
  },
];

// Mobile bottom-nav — 5-tab IA from Slice 41, with Bookings reordered to
// the middle slot (index 2) so it can render as the raised "exposed-above"
// FAB-style item in `mobile-bottom-nav.tsx`.
export const MOBILE_BOTTOM_NAV: {
  label: string;
  href: string;
  icon: LucideIcon | typeof Spiderweb;
  match?: string[];
}[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Flash", href: "/flash", icon: Spiderweb, match: ["/flash"] },
  {
    label: "Bookings",
    href: "/bookings/overview",
    icon: Inbox,
    match: ["/bookings"],
  },
  { label: "Guest Spots", href: "/travel", icon: MapPin },
  {
    label: "Settings",
    href: "/settings/profile",
    icon: Settings,
    match: ["/settings"],
  },
];

// Keep CalendarDays and Users imports usable by other components that pull from
// nav-config — re-export from lucide-react for convenience.
export { CalendarDays, Users };

function pathMatchesPrefix(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (pathname.startsWith(href + "/")) return true;
  return false;
}

export function isItemActive(
  pathname: string,
  item: { href: string; match?: string[] },
): boolean {
  if (item.href === "/dashboard") return pathname === "/dashboard";
  if (pathMatchesPrefix(pathname, item.href)) return true;
  if (item.match) {
    for (const prefix of item.match) {
      if (pathMatchesPrefix(pathname, prefix)) return true;
    }
  }
  return false;
}
