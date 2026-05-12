import Link from "next/link";
import { Link2, Inbox, CheckSquare, CalendarDays } from "lucide-react";
import { IconChip, type IconTint } from "@/components/ui/card";

const AREAS: Array<{
  icon: typeof Link2;
  tint: IconTint;
  title: string;
  desc: string;
}> = [
  {
    icon: Link2,
    tint: "mustard",
    title: "Your booking link",
    desc: "One link in your bio. Clients click it to submit a request.",
  },
  {
    icon: Inbox,
    tint: "rosa",
    title: "Structured requests",
    desc: "Clients fill in placement, style, size, and more — before you talk.",
  },
  {
    icon: CheckSquare,
    tint: "cobalt",
    title: "Review and approve",
    desc: "Every request lands in your dashboard. Approve or decline in one place.",
  },
  {
    icon: CalendarDays,
    tint: "green",
    title: "Stay organised",
    desc: "Approved bookings go straight to your calendar.",
  },
];

export default function OnboardingWelcomePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          inklee
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Let&apos;s get your booking page ready.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A few quick steps to set up the essentials. Takes about 3 minutes. You
          can adjust everything later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AREAS.map(({ icon, tint, title, desc }) => (
          <div
            key={title}
            className="flex items-start gap-3 rounded-[20px] border border-border p-4"
          >
            <IconChip icon={icon} tint={tint} size="sm" />
            <div className="space-y-0.5 min-w-0">
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
          className="block w-full rounded-md bg-brand-mustard px-4 py-3 text-center text-sm font-medium text-brand-charcoal"
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
