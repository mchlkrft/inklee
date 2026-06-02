import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isConnectStatus, type ConnectStatus } from "@/lib/stripe-connect";
import PayoutsControls from "./payouts-controls";

const STATUS_LABEL: Record<ConnectStatus, string> = {
  unset: "Not connected",
  pending: "Onboarding in progress",
  active: "Connected",
  restricted: "Action needed",
  disabled: "Disabled by Stripe",
};

const STATUS_DESCRIPTION: Record<ConnectStatus, string> = {
  unset:
    "Connect a Stripe account to receive deposits and sell goods directly to your clients. Stripe handles your onboarding and payouts; Inklee never holds your money.",
  pending:
    "You started Stripe onboarding but haven't finished yet. Pick up where you left off — your progress is saved.",
  active:
    "Your Stripe account is ready. Deposits + goods payments will route to your account once we flip the live switch.",
  restricted:
    "Stripe needs more information before you can take payments. Open your Stripe dashboard to clear the requirements.",
  disabled:
    "Stripe disabled this account. Contact Stripe support for next steps.",
};

export default async function PayoutsSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country, stripe_account_updated_at",
    )
    .eq("id", user!.id)
    .single();

  const rawStatus = profile?.stripe_account_status as string | null;
  const status: ConnectStatus = isConnectStatus(rawStatus)
    ? rawStatus
    : "unset";
  const accountId = profile?.stripe_account_id as string | null;
  const chargesEnabled = !!profile?.stripe_charges_enabled;
  const payoutsEnabled = !!profile?.stripe_payouts_enabled;
  const country = profile?.stripe_account_country as string | null;
  const updatedAt = profile?.stripe_account_updated_at as string | null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Payouts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Stripe to receive deposits and sell goods directly. Each
          payment lands in your own Stripe account; Inklee never holds the
          money.
        </p>
      </div>

      <div className="space-y-3 rounded-[20px] border border-border p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Status
          </p>
          <StatusBadge status={status} />
        </div>
        <p className="text-sm text-foreground">{STATUS_LABEL[status]}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {STATUS_DESCRIPTION[status]}
        </p>

        {(status === "active" ||
          status === "restricted" ||
          status === "disabled") &&
          accountId && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-3 text-xs">
              <dt className="text-muted-foreground">Account</dt>
              <dd className="font-mono text-foreground">{accountId}</dd>
              {country && (
                <>
                  <dt className="text-muted-foreground">Country</dt>
                  <dd className="text-foreground">{country.toUpperCase()}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Charges enabled</dt>
              <dd className="text-foreground">
                {chargesEnabled ? "Yes" : "No"}
              </dd>
              <dt className="text-muted-foreground">Payouts enabled</dt>
              <dd className="text-foreground">
                {payoutsEnabled ? "Yes" : "No"}
              </dd>
              {updatedAt && (
                <>
                  <dt className="text-muted-foreground">Last synced</dt>
                  <dd className="text-foreground">
                    {new Date(updatedAt).toLocaleString()}
                  </dd>
                </>
              )}
            </dl>
          )}
      </div>

      <PayoutsControls status={status} accountId={accountId} />

      <p className="text-xs text-muted-foreground">
        Production goods checkout stays disabled until the deployment-wide
        switch is flipped. Connecting your account now is safe and reversible —
        see{" "}
        <a
          href="https://stripe.com/docs/connect/express-accounts"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
        >
          Stripe Express accounts
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>{" "}
        for what the onboarding looks like.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: ConnectStatus }) {
  const tone =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "pending"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : status === "restricted"
          ? "bg-orange-500/15 text-orange-700 dark:text-orange-300"
          : status === "disabled"
            ? "bg-destructive/15 text-destructive"
            : "bg-muted text-muted-foreground";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
