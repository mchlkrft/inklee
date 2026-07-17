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
  Link2,
  Compass,
  Building2,
  type LucideIcon,
} from "lucide-react";
import Spiderweb from "@/components/icons/spiderweb";
import { tattooMapEnabled } from "@/lib/map-features";

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
        // /bookings/overview (Requests · Clients · Waitlist). Deposits here is
        // the cross-booking chase overview (who owes a deposit); the deposit
        // DEFAULTS + cancellation/refund policy are account configuration and
        // live under Settings > Deposits. Booking Settings (formerly "Books &
        // Availability") sits last as the configuration surface for this group.
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
      {
        label: "Goods",
        href: "/goods",
        icon: ShoppingBag,
        match: ["/goods"],
        children: [
          { label: "Products", href: "/goods" },
          { label: "Sales", href: "/goods/sales" },
        ],
      },
      { label: "Guest Spots", href: "/travel", icon: MapPin },
      // Inklee 2.0 discovery map, flag-gated (the NEXT_PUBLIC_* read inside
      // the helper is inlined at build time on server and client alike).
      ...(tattooMapEnabled()
        ? [
            { label: "Tattoo map", href: "/map", icon: Compass },
            { label: "Studio", href: "/studio", icon: Building2 },
          ]
        : []),
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Link Hub", href: "/link-hub", icon: Link2 },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
      { label: "Notifications", href: "/notifications", icon: Bell },
      {
        label: "Settings",
        href: "/settings/profile",
        icon: Settings,
        // "/support" keeps the Settings group open while on the support pages
        // — Support lives here as the last sub-item (founder call, 2026-07-04).
        match: ["/settings", "/support"],
        children: [
          { label: "Profile", href: "/settings/profile" },
          ...(tattooMapEnabled()
            ? [{ label: "Map presence", href: "/settings/map" }]
            : []),
          { label: "Emails", href: "/settings/emails" },
          { label: "Calendar", href: "/settings/calendar" },
          { label: "Payouts", href: "/settings/payouts" },
          { label: "Deposits", href: "/settings/deposits" },
          { label: "Home widgets", href: "/settings/dashboard" },
          { label: "Account", href: "/settings/account" },
          { label: "Support", href: "/support" },
        ],
      },
    ],
  },
];

// Mobile bottom-nav — 5-tab IA from Slice 41, with Bookings reordered to
// the middle slot (index 2) so it can render as the raised "exposed-above"
// FAB-style item in `mobile-bottom-nav.tsx`.
//
// Slice 77: Goods replaced Settings in the last slot. Goods is a primary
// surface that had no mobile entry point at all; Settings now lives only in
// the top-right account menu (`mobile-top-bar.tsx`), since it's configuration
// rather than a day-to-day destination.
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
  { label: "Goods", href: "/goods", icon: ShoppingBag, match: ["/goods"] },
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
