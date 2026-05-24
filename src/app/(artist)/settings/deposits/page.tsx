import Link from "next/link";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  parseDepositDefaults,
  detectStripeMode,
  type StripeMode,
} from "@/lib/deposit-settings";
import DepositsForm from "./deposits-form";

function StripeStatus({ mode }: { mode: StripeMode }) {
  if (mode === "live") {
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-brand-green/30 bg-brand-green/[0.06] px-4 py-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            Stripe is connected in live mode
          </p>
          <p className="text-xs text-muted-foreground">
            Real card payments process through Inklee’s Stripe account. Funds
            settle to the operator and are accounted for separately.
          </p>
        </div>
      </div>
    );
  }
  if (mode === "test") {
    return (
      // Required test-mode banner — yellow when pk_test_* keys are configured.
      // Won't fire in production now that live keys are in place; primarily a
      // dev/preview safeguard so a deposit isn't requested expecting real funds.
      <div className="flex items-start gap-2.5 rounded-md border border-orange-400/40 bg-orange-400/[0.07] px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-orange-400">
            Stripe is in test mode
          </p>
          <p className="text-xs text-orange-400/90">
            Deposit requests made from this environment will NOT process real
            payments. Switch the publishable + secret keys to live values before
            requesting a deposit from a real client.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border px-4 py-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">
          Stripe is not configured here
        </p>
        <p className="text-xs text-muted-foreground">
          Deposit requests can still be tracked, but they won’t be paid through
          the in-app flow until Stripe keys are present.
        </p>
      </div>
    </div>
  );
}

export default async function DepositsSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user!.id)
    .single();

  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const defaults = parseDepositDefaults(settings.deposit_defaults);
  const stripeMode = detectStripeMode(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Deposits
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Defaults for the deposit you request once you’ve accepted a booking.
        </p>
      </div>

      {/* Required platform disclaimer — same wording used on the homepage,
          comparison pages, and public booking-page legal notice. */}
      <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
        <p className="text-sm leading-relaxed text-foreground">
          Inklee is built to make deposits part of the booking flow.
          Availability depends on your current setup and enabled features.
        </p>
      </div>

      <StripeStatus mode={stripeMode} />

      <div className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">
          Your defaults
        </h2>
        <p className="text-sm text-muted-foreground">
          These pre-fill the deposit form on every accepted request. You can
          override any field per booking.
        </p>
      </div>

      <DepositsForm defaults={defaults} />

      <div className="rounded-md border border-border px-4 py-3 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Where deposits live in the flow
        </p>
        <p className="text-xs text-muted-foreground">
          When you accept a request from{" "}
          <Link
            href="/bookings/overview"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Bookings
          </Link>
          , a “Request deposit” option appears on the booking detail. The client
          receives an email with a secure payment link.
        </p>
      </div>
    </div>
  );
}
