import BookingsNav from "@/components/bookings-nav";

export default function BookingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      {/* Mobile-only — desktop reaches sub-pages via the sidebar */}
      <div className="md:hidden">
        <BookingsNav />
      </div>
      {children}
    </div>
  );
}
