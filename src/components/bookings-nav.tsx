import SectionNav from "./section-nav";

const ITEMS = [
  { label: "Overview", href: "/bookings/overview" },
  { label: "Calendar", href: "/bookings/calendar" },
  { label: "Waitlist", href: "/bookings/waitlist" },
  { label: "Booking Settings", href: "/bookings/settings" },
  { label: "Booking Form", href: "/bookings/booking-form" },
];

export default function BookingsNav() {
  return <SectionNav items={ITEMS} />;
}
