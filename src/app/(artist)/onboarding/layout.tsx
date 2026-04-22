export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center -mt-8 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
