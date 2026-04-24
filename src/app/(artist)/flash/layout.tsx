import FlashNav from "@/components/flash-nav";

export default function FlashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-6 -mt-8">
      <FlashNav />
      <div className="mx-6 mt-8">{children}</div>
    </div>
  );
}
