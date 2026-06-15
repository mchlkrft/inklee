import SettingsNav from "@/components/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      {/* Mobile-only — desktop reaches sub-pages via the sidebar */}
      <div className="md:hidden">
        <SettingsNav />
      </div>
      {children}
    </div>
  );
}
