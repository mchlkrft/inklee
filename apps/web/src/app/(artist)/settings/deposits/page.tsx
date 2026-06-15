import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { parseDepositDefaults, detectStripeMode } from "@/lib/deposit-settings";
import { parseDepositPolicy } from "@/lib/deposit-policy";
import DepositsForm from "./deposits-form";
import DepositPolicyForm from "./deposit-policy-form";

// Deposit configuration: the request defaults and the cancellation + refund
// policy. The live list of who owes a deposit moved to /bookings/deposits (the
// chase overview). Stripe Connect / card-collection status is owned by
// /settings/payouts, so here we keep only a one-line pointer rather than
// duplicating that block.
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
  const depositPolicy = parseDepositPolicy(settings.deposit_policy);
  const stripeMode = detectStripeMode(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Deposit settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Defaults for the deposit you request once you have accepted a booking,
          and the policy clients see before they pay. See who currently owes a
          deposit in{" "}
          <Link
            href="/bookings/deposits"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Deposits
          </Link>
          .
        </p>
      </div>

      {stripeMode === "test" && (
        <div className="flex items-start gap-2.5 rounded-md border border-brand-mustard/50 bg-brand-mustard/15 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-mustard" />
          <p className="text-xs text-foreground">
            Deposits are in test mode in this environment. No real charges will
            be made.
          </p>
        </div>
      )}

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

      <div className="space-y-2 border-t border-border pt-6">
        <h2 className="text-base font-semibold text-foreground">
          Cancellation and refunds
        </h2>
        <p className="text-sm text-muted-foreground">
          Your deposit policy is shown to clients before they pay, and it&apos;s
          locked to each booking at payment time. The structure is set by
          Inklee&apos;s platform policy and can&apos;t be replaced with free
          text. See{" "}
          <Link
            href="/terms"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Terms section 12
          </Link>{" "}
          and the{" "}
          <Link
            href="/dpa"
            className="underline underline-offset-2 hover:text-foreground"
          >
            DPA
          </Link>
          .
        </p>
      </div>

      <DepositPolicyForm policy={depositPolicy} />

      <div className="space-y-1 rounded-md border border-border px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">
          Collecting card deposits
        </p>
        <p className="text-xs text-muted-foreground">
          To let clients pay deposits by card in-app, connect Stripe in{" "}
          <Link
            href="/settings/payouts"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Payouts
          </Link>
          . Without it you can still request deposits and mark them received
          when the client pays you directly.
        </p>
      </div>
    </div>
  );
}
