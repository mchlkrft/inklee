import Link from "next/link";
import {
  CheckCircle2,
  CreditCard,
  Link2,
  Mail,
  Plane,
  Zap,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoUpload from "./logo-upload";

const OPTIONAL_FEATURES = [
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
    href: "/settings/emails",
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
    .select("slug, display_name, booking_mode, settings, logo_url")
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

  const { count: slotCount } =
    profile.booking_mode === "fixed_slots"
      ? await supabase
          .from("slots")
          .select("id", { count: "exact", head: true })
          .eq("artist_id", user!.id)
          .eq("status", "open")
      : { count: 0 };

  const hasRequiredAvailability =
    profile.booking_mode !== "fixed_slots" || (slotCount ?? 0) > 0;
  const isReadyToShare = hasRequiredAvailability;

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
    {
      label: "Availability configured",
      detail:
        profile.booking_mode === "fixed_slots"
          ? (slotCount ?? 0) > 0
            ? `${slotCount} open slot${slotCount === 1 ? "" : "s"}`
            : "Add at least one slot before sharing"
          : "Preferred-date requests enabled",
    },
    {
      label: "Booking form ready",
      detail: isReadyToShare
        ? "Clients can submit requests"
        : "Finish availability setup first",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-brand-green" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isReadyToShare ? "You are ready." : "Almost ready."}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {isReadyToShare
            ? "Your booking page has the basics in place and can be shared."
            : "Your public page exists, but clients cannot safely book until the required availability setup is finished."}
        </p>
      </div>

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
            Preview your page
          </a>
          {!isReadyToShare && (
            <Link
              href="/bookings/settings"
              className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              Finish setup
            </Link>
          )}
        </div>
      </div>

      <LogoUpload logoUrl={profile.logo_url ?? null} />

      <Link
        href={isReadyToShare ? "/dashboard" : "/bookings/settings"}
        className="block w-full rounded-md bg-brand-mustard px-4 py-3 text-center text-sm font-medium text-brand-charcoal"
      >
        {isReadyToShare ? "Go to dashboard" : "Set up availability"}
      </Link>

      <div className="space-y-3 pt-2">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Set up when ready
        </p>
        <p className="text-xs text-muted-foreground">
          These are optional - configure them whenever they actually help your
          workflow.
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
