import { createClient } from "@/lib/supabase/server";
import {
  isConnectStatus,
  getConnectRequirements,
  type ConnectStatus,
} from "@/lib/stripe-connect";
import { PLATFORM_FEE_PERCENT } from "@/lib/platform-fee";
import PayoutsControls from "./payouts-controls";
import ConnectKycForm from "./connect-kyc-form";

const STATUS_LABEL: Record<ConnectStatus, string> = {
  unset: "Not connected",
  pending: "Onboarding in progress",
  active: "Connected",
  restricted: "Action needed",
  disabled: "Disabled by Stripe",
};

const STATUS_DESCRIPTION: Record<ConnectStatus, string> = {
  unset: `Optional. Set this up only if you want clients to pay deposits by card here. You enter your details below, Inklee verifies you with Stripe, and deposits land in your own account. Inklee keeps a ${PLATFORM_FEE_PERCENT}% fee per deposit (card processing included) and never holds your money.`,
  pending:
    "Stripe is verifying your details. Use Refresh status to check, or update your details below if something was off.",
  active: `You're verified. Clients can now pay deposits by card, each deposit lands in your account, and Inklee keeps a ${PLATFORM_FEE_PERCENT}% fee (card processing included).`,
  restricted:
    "Stripe needs a bit more before you can take payments. Update your details below.",
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

  // P0-3: for a not-yet-active account, fetch what Stripe still needs so the
  // form can show it on load (the artist can only self-resolve if we tell them).
  const requirementsDue =
    accountId && (status === "pending" || status === "restricted")
      ? await getConnectRequirements(accountId)
      : [];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Payouts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional. Set this up only if you want clients to pay deposits by card
          here. Each deposit lands in your own account and Inklee keeps a{" "}
          {PLATFORM_FEE_PERCENT}% fee (card processing included). Without it,
          you can still collect deposits manually.
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

      {status !== "active" && status !== "disabled" && (
        <div className="rounded-[20px] border border-border p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            {status === "unset" ? "Set up payouts" : "Your details"}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            You complete this here. Your details go straight to Stripe for
            verification and are not stored by Inklee.
          </p>
          <ConnectKycForm
            status={status}
            email={user?.email ?? ""}
            requirementsDue={requirementsDue}
          />
        </div>
      )}

      <PayoutsControls hasAccount={accountId !== null} />

      <p className="text-xs text-muted-foreground">
        Setting up payouts is optional and reversible. Deposits you collect this
        way land in your own account, and Inklee keeps a {PLATFORM_FEE_PERCENT}%
        fee that covers card processing.
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
