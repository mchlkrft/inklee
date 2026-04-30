import FlashNav from "@/components/flash-nav";

export default function FlashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-4 -mt-6 md:-mx-6 md:-mt-8">
      <FlashNav />
      <div className="mx-4 mt-6 md:mx-6 md:mt-8">{children}</div>
    </div>
  );
}
