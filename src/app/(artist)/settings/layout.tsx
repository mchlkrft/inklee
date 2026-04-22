import SettingsNav from "@/components/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-6 -mt-8">
      <SettingsNav />
      <div className="mx-6 mt-8">{children}</div>
    </div>
  );
}
