import BookingsNav from "@/components/bookings-nav";

export default function BookingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-6 -mt-8">
      <BookingsNav />
      <div className="mx-6 mt-8">{children}</div>
    </div>
  );
}
