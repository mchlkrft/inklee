// Onboarding owns the whole viewport — sidebar, top bar, and mobile
// bottom nav are hidden on /onboarding/* (see app-shell components).
// `fixed inset-0` also escapes the parent <main>'s pb-28 mobile padding
// so the final CTA never sits underneath where the bottom nav would be.
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Centered, but scrollable without clipping. A flex container with
  // `justify-center` + `overflow-y-auto` traps content taller than the
  // viewport ABOVE the scroll origin — you can't scroll up to reach it, so
  // the top gets cut off (DT-1). Instead the OUTER div owns the scroll and an
  // inner `min-h-full` wrapper centers when content is short but grows and
  // scrolls from the top when it's tall.
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-background">
      <div className="flex min-h-full flex-col items-center justify-center">
        <div className="w-full max-w-md px-4 py-6">{children}</div>
      </div>
    </div>
  );
}
