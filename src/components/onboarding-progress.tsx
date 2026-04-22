const STEPS = ["Identity", "Profile", "Booking", "Go live"];

export default function OnboardingProgress({
  current,
}: {
  current: 1 | 2 | 3 | 4;
}) {
  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                  done
                    ? "bg-foreground text-background"
                    : active
                      ? "border-2 border-foreground text-foreground"
                      : "border border-border text-muted-foreground"
                }`}
              >
                {done ? "✓" : step}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px flex-1 min-w-4 ${done ? "bg-foreground" : "bg-border"}`}
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
