import BookingsNav from "@/components/bookings-nav";

export default function BookingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-4 -mt-6 md:-mx-6 md:-mt-8">
      <BookingsNav />
      <div className="mx-4 mt-6 md:mx-6 md:mt-8">{children}</div>
    </div>
  );
}
