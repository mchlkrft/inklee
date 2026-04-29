const STEPS = ["Profile", "Booking", "Availability", "Form", "Done"];

export default function OnboardingProgress({
  current,
}: {
  current: 1 | 2 | 3 | 4 | 5;
}) {
  return (
    <div className="space-y-3 mb-8">
      <div className="flex items-center gap-1.5">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          return (
            <div
              key={label}
              className="flex items-center gap-1.5 flex-1 last:flex-none"
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                  done
                    ? "bg-brand-mustard text-brand-charcoal"
                    : active
                      ? "border-2 border-brand-mustard text-foreground"
                      : "border border-border text-muted-foreground"
                }`}
              >
                {done ? "✓" : step}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px flex-1 ${done ? "bg-brand-mustard" : "bg-border"}`}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Step {current} of {STEPS.length} — {STEPS[current - 1]}
      </p>
    </div>
  );
}
