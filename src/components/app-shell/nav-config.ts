import {
  LayoutDashboard,
  Inbox,
  Zap,
  MapPin,
  BarChart3,
  Bell,
  Settings,
  CalendarDays,
  Users,
  type LucideIcon,
} from "lucide-react";

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
        children: [
          { label: "Bookings", href: "/bookings/overview" },
          { label: "Calendar", href: "/bookings/calendar" },
          { label: "Waitlist", href: "/bookings/waitlist" },
          { label: "Books & Availability", href: "/bookings/settings" },
          { label: "My Booking Form", href: "/bookings/booking-form" },
        ],
      },
      {
        label: "Flash",
        href: "/flash",
        icon: Zap,
        match: ["/flash"],
        children: [
          { label: "Designs", href: "/flash/items" },
          { label: "Days", href: "/flash/days" },
          { label: "Instagram", href: "/flash/instagram" },
        ],
      },
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
          { label: "Emails", href: "/settings/emails" },
          { label: "Calendar", href: "/settings/calendar" },
          { label: "Home widgets", href: "/settings/dashboard" },
          { label: "Account", href: "/settings/account" },
        ],
      },
    ],
  },
];

// Mobile bottom-nav keeps the existing 5-tab IA (validated by Slice 41)
export const MOBILE_BOTTOM_NAV: {
  label: string;
  href: string;
  icon: LucideIcon;
  match?: string[];
}[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Bookings",
    href: "/bookings/overview",
    icon: Inbox,
    match: ["/bookings"],
  },
  { label: "Flash", href: "/flash", icon: Zap, match: ["/flash"] },
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
