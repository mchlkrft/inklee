import SectionNav from "./section-nav";

const ITEMS = [
  { label: "Bookings", href: "/bookings/overview" },
  { label: "Calendar", href: "/bookings/calendar" },
  { label: "Waitlist", href: "/bookings/waitlist" },
  { label: "Books & Availability", href: "/bookings/settings" },
  { label: "My Booking Form", href: "/bookings/booking-form" },
];

export default function BookingsNav() {
  return <SectionNav items={ITEMS} />;
}
