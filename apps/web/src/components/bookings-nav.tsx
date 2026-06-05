import SectionNav from "./section-nav";

const ITEMS = [
  { label: "Overview", href: "/bookings/overview" },
  { label: "Calendar", href: "/bookings/calendar" },
  { label: "Deposits", href: "/bookings/deposits" },
  { label: "My Booking Form", href: "/bookings/booking-form" },
  { label: "Booking Settings", href: "/bookings/settings" },
];

export default function BookingsNav() {
  return <SectionNav items={ITEMS} />;
}
