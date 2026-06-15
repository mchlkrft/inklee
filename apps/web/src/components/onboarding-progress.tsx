import Link from "next/link";
import { Check } from "lucide-react";

// Step → route map. Used both to label the bar and to let an artist
// jump back to an already-completed step (rare, but cheap to allow).
const STEPS = [
  { label: "Link", href: "/onboarding/claim-slug" },
  { label: "Booking", href: "/onboarding/booking" },
  { label: "Availability", href: "/onboarding/availability" },
  { label: "Form", href: "/onboarding/form" },
  { label: "Done", href: "/onboarding/done" },
] as const;

export default function OnboardingProgress({
  current,
}: {
  current: 1 | 2 | 3 | 4 | 5;
}) {
  return (
    <div className="space-y-3 mb-8">
      <div className="flex items-center gap-1.5">
        {STEPS.map(({ label, href }, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;

          const circle = (
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                done
                  ? "bg-brand-mustard text-brand-charcoal"
                  : active
                    ? "border-2 border-brand-mustard text-foreground"
                    : "border border-border text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : step}
            </div>
          );

          return (
            <div
              key={label}
              className="flex items-center gap-1.5 flex-1 last:flex-none"
            >
              {done ? (
                // Completed steps are clickable so an artist can step back
                // and revise an earlier answer.
                <Link
                  href={href}
                  title={`Back to ${label}`}
                  aria-label={`Go back to step ${step}: ${label}`}
                  className="rounded-full transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-mustard focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {circle}
                </Link>
              ) : (
                circle
              )}
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
        Step {current} of {STEPS.length} — {STEPS[current - 1].label}
      </p>
    </div>
  );
}
