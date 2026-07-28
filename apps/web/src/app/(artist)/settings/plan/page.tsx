import { createClient } from "@/lib/supabase/server";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { effectivePlanTier, isGrandfathered } from "@/lib/entitlements";
import { PLUS_CONSUMER_LAUNCH_ENABLED } from "@/lib/plus-launch-config";
import { getWithdrawalWindow } from "@/lib/server/billing/withdrawal";
import { getPlusPriceDisplay } from "@/lib/server/billing/subscription";
import { PLUS_BENEFITS } from "@inklee/shared/plus-benefits";
import CheckBadge from "@/components/check-badge";
import UpgradeButton from "./upgrade-button";
import ManageSubscriptionButton from "./manage-subscription-button";
import WithdrawButton from "./withdraw-button";

export const metadata = { title: "Plan" };

// The same checkmark as the /pricing cards: a filled mustard circle with a
// charcoal check (founder correction 2026-07-25, better visibility).
const Check = CheckBadge;

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const overrides = await getAccountOverrides(user!.id);
  const tier = effectivePlanTier(overrides);
  const grandfathered = isGrandfathered(overrides);
  const keepsTemplates =
    grandfathered &&
    overrides.grantPackage?.features?.custom_templates === true;

  // A grandfathered artist who already keeps template editing shouldn't be sold
  // it back as an upgrade reason.
  const upgradeBenefits = keepsTemplates
    ? PLUS_BENEFITS.filter((b) => !b.includes("email templates"))
    : PLUS_BENEFITS;

  // The Plus prices for the pre-checkout panel (counsel condition: total price
  // on the same screen as the pay button, directly above it). Resolved from the
  // SAME Stripe Prices checkout charges; null (no Price / Stripe error) falls
  // back to the price-on-next-step sentence, and a missing yearly Price simply
  // hides the yearly option (fail-safe).
  const showUpgrade = PLUS_CONSUMER_LAUNCH_ENABLED && tier === "free";
  const plusPrice = showUpgrade ? await getPlusPriceDisplay() : null;
  // The viewer id is passed so the founder first-year total shows ONLY to an
  // eligible viewer; everyone else sees the list price, which is what their
  // checkout will actually charge.
  const plusYearlyPrice = showUpgrade
    ? await getPlusPriceDisplay("yearly", user!.id)
    : null;

  // The concrete withdrawal deadline (Art. 11a step 2), resolved only for a Plus
  // subscriber and only when the consumer flow is live. Preformatted server-side
  // so the client component shows a stable, locale-consistent date.
  const withdrawalWindow =
    PLUS_CONSUMER_LAUNCH_ENABLED && tier === "plus"
      ? await getWithdrawalWindow(user!.id)
      : null;
  const withdrawalDeadlineLabel = withdrawalWindow?.deadline
    ? new Date(withdrawalWindow.deadline).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Plan
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your Inklee plan and what it includes.
        </p>
      </div>

      {/* Current plan */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Current plan</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {tier === "plus" ? "Plus" : "Free"}
            </p>
          </div>
          {tier === "plus" && (
            <span className="rounded-full bg-brand-mustard px-3 py-1 text-xs font-semibold text-brand-charcoal">
              Active
            </span>
          )}
        </div>

        {tier === "free" && grandfathered && (
          <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            You&apos;re on Free with early-artist benefits.
            {keepsTemplates
              ? " You keep custom email templates from before Plus launched."
              : ""}
          </p>
        )}
      </section>

      {/* Upgrade / benefits */}
      {tier === "free" ? (
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">
            Upgrade to Plus
          </h2>
          <ul className="mt-4 space-y-2">
            {upgradeBenefits.map((b) => (
              <li
                key={b}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <Check />
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {PLUS_CONSUMER_LAUNCH_ENABLED ? (
              <UpgradeButton
                label="Upgrade to Plus"
                priceLabel={plusPrice?.label ?? null}
                yearlyBaseLabel={plusYearlyPrice?.label ?? null}
                yearlyFirstYearLabel={plusYearlyPrice?.firstYearLabel ?? null}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Plus is coming soon.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">
            Your Plus benefits
          </h2>
          <ul className="mt-4 space-y-2">
            {PLUS_BENEFITS.map((b) => (
              <li
                key={b}
                className="flex items-start gap-2 text-sm text-foreground"
              >
                <Check />
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <ManageSubscriptionButton />
          </div>
          {PLUS_CONSUMER_LAUNCH_ENABLED && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {withdrawalDeadlineLabel && withdrawalWindow?.withinWindow
                  ? `Bought Inklee Plus recently? You can withdraw until ${withdrawalDeadlineLabel}, which is separate from cancelling.`
                  : "Bought Inklee Plus in the last 14 days? You have a right to withdraw, which is separate from cancelling."}
              </p>
              <div className="mt-2">
                <WithdrawButton
                  deadlineLabel={withdrawalDeadlineLabel}
                  withinWindow={withdrawalWindow?.withinWindow ?? true}
                />
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
