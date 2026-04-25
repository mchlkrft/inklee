import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Link2,
  Image as ImageIcon,
  Zap,
  Plane,
  Mail,
  CreditCard,
} from "lucide-react";

const OPTIONAL_FEATURES = [
  {
    icon: ImageIcon,
    label: "Logo & branding",
    href: "/settings/profile",
  },
  {
    icon: Zap,
    label: "Flash items",
    href: "/flash/items",
  },
  {
    icon: Plane,
    label: "Travel / guest spots",
    href: "/travel",
  },
  {
    icon: Mail,
    label: "Email templates",
    href: "/settings/templates",
  },
  {
    icon: CreditCard,
    label: "Deposit collection",
    href: "/bookings/overview",
  },
] as const;

export default async function OnboardingDonePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, display_name, booking_mode, settings")
    .eq("id", user!.id)
    .single();

  if (!profile?.slug) redirect("/onboarding/claim-slug");

  const currentSettings = (profile.settings ?? {}) as Record<string, unknown>;
  if (!currentSettings.onboarding_completed) {
    await supabase
      .from("profiles")
      .update({
        settings: { ...currentSettings, onboarding_completed: true },
        updated_at: new Date().toISOString(),
      })
      .eq("id", user!.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const publicUrl = `${appUrl}/${profile.slug}`;

  const completedItems = [
    { label: "Profile set up", detail: profile.display_name },
    {
      label: "Booking mode",
      detail:
        profile.booking_mode === "fixed_slots"
          ? "Fixed slots"
          : "Preferred date",
    },
    { label: "Availability configured", detail: null },
    { label: "Booking form ready", detail: null },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <h1 className="text-xl font-semibold text-foreground">
            You&apos;re ready.
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Your booking page is live and ready to share.
        </p>
      </div>

      {/* Completion summary */}
      <div className="rounded-md border border-border divide-y divide-border">
        {completedItems.map(({ label, detail }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{label}</p>
              {detail && (
                <p className="text-xs text-muted-foreground">{detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Booking link */}
      <div className="rounded-md border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">
            Your booking link
          </p>
        </div>
        <p className="font-mono text-sm text-foreground">
          {publicUrl.replace(/^https?:\/\//, "")}
        </p>
        <div className="flex gap-2">
          <a
            href={`/${profile.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            Preview your page ↗
          </a>
        </div>
      </div>

      {/* Primary CTA */}
      <Link
        href="/dashboard"
        className="block w-full rounded-md bg-foreground px-4 py-3 text-center text-sm font-medium text-background"
      >
        Go to dashboard →
      </Link>

      {/* Optional features — set up later */}
      <div className="space-y-3 pt-2">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Set up when ready
        </p>
        <p className="text-xs text-muted-foreground">
          These are optional — configure them whenever it makes sense.
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {OPTIONAL_FEATURES.map(({ icon: Icon, label, href }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
