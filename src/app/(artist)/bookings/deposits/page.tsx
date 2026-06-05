import Link from "next/link";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  parseDepositDefaults,
  detectStripeMode,
  type StripeMode,
} from "@/lib/deposit-settings";
import { getConnectRoutingForArtist } from "@/lib/stripe-connect";
import { PLATFORM_FEE_PERCENT } from "@/lib/platform-fee";
import { parseDepositPolicy } from "@/lib/deposit-policy";
import DepositsForm from "./deposits-form";
import DepositPolicyForm from "./deposit-policy-form";

// F3 (RS-5): the status shown here keys off the ARTIST'S Stripe Connect state
// (can they collect a card deposit in-app?), not the global publishable-key
// mode. The old copy ("payments process through Inklee's account; funds settle
// to the operator") described the pre-Connect platform-charge model and is now
// false — deposits land in the artist's OWN connected account; Inklee only
// keeps the platform fee. The test-mode note stays as a dev/preview safeguard.
function DepositCollectionStatus({
  canCollectInApp,
  stripeMode,
}: {
  canCollectInApp: boolean;
  stripeMode: StripeMode;
}) {
  return (
    <div className="space-y-3">
      {canCollectInApp ? (
        <div className="flex items-start gap-2.5 rounded-md border border-brand-green/30 bg-brand-green/[0.06] px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              In-app card deposits are on
            </p>
            <p className="text-xs text-muted-foreground">
              When a client pays a deposit by card, it lands in your own
              connected Stripe account. Inklee keeps a {PLATFORM_FEE_PERCENT}%
              fee (card processing included) and never holds your money.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-md border border-border px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              In-app card deposits are off
            </p>
            <p className="text-xs text-muted-foreground">
              You can still request deposits. The client pays you directly (add
              your details in the note) and you mark them received.{" "}
              <Link
                href="/settings/payouts"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Connect Stripe
              </Link>{" "}
              to let clients pay by card here instead.
            </p>
          </div>
        </div>
      )}
      {stripeMode === "test" && (
        <div className="flex items-start gap-2.5 rounded-md border border-brand-mustard/50 bg-brand-mustard/15 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-mustard" />
          <p className="text-xs text-foreground">
            Deposits are in test mode in this environment. No real charges will
            be made.
          </p>
        </div>
      )}
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
  const depositPolicy = parseDepositPolicy(settings.deposit_policy);
  const stripeMode = detectStripeMode(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );
  const canCollectInApp = (await getConnectRoutingForArtist(user!.id))
    .routeCharges;

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

      <DepositCollectionStatus
        canCollectInApp={canCollectInApp}
        stripeMode={stripeMode}
      />

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
          Cancellation &amp; refunds
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
