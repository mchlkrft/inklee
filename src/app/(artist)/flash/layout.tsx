import FlashNav from "@/components/flash-nav";

export default function FlashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      {/* Mobile-only — desktop reaches sub-pages via the sidebar */}
      <div className="md:hidden">
        <FlashNav />
      </div>
      {children}
    </div>
  );
}
