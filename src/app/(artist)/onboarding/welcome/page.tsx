import Link from "next/link";
import { Link2, Inbox, CheckSquare, CalendarDays } from "lucide-react";

const AREAS = [
  {
    icon: Link2,
    title: "Your booking link",
    desc: "One link in your bio. Clients click it to submit a request.",
  },
  {
    icon: Inbox,
    title: "Structured requests",
    desc: "Clients fill in placement, style, size, and more — before you talk.",
  },
  {
    icon: CheckSquare,
    title: "Review and approve",
    desc: "Every request lands in your dashboard. Approve or decline in one place.",
  },
  {
    icon: CalendarDays,
    title: "Stay organised",
    desc: "Approved bookings go straight to your calendar.",
  },
] as const;

export default function OnboardingWelcomePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          inklee
        </p>
        <h1 className="text-2xl font-semibold text-foreground">
          Let&apos;s get your booking page ready.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A few quick steps to set up the essentials. Takes about 3 minutes. You
          can adjust everything later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AREAS.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex items-start gap-3 rounded-md border border-border p-4"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="text-xs leading-snug text-muted-foreground">
                {desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <Link
          href="/onboarding/claim-slug"
          className="block w-full rounded-md bg-foreground px-4 py-3 text-center text-sm font-medium text-background"
        >
          Start setup →
        </Link>
        <p className="text-center text-xs text-muted-foreground">
          Essential setup only. All advanced features are optional and can be
          configured later.
        </p>
      </div>
    </div>
  );
}
