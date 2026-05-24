// Onboarding owns the whole viewport — sidebar, top bar, and mobile
// bottom nav are hidden on /onboarding/* (see app-shell components).
// `fixed inset-0` also escapes the parent <main>'s pb-28 mobile padding
// so the final CTA never sits underneath where the bottom nav would be.
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-background">
      <div className="w-full max-w-md px-4 py-6">{children}</div>
    </div>
  );
}
