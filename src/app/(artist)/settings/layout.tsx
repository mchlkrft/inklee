import SettingsNav from "@/components/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-4 -mt-6 md:-mx-6 md:-mt-8">
      <SettingsNav />
      <div className="mx-4 mt-6 md:mx-6 md:mt-8">{children}</div>
    </div>
  );
}
