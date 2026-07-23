import { createClient } from "@/lib/supabase/server";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { effectivePlanTier, isGrandfathered } from "@/lib/entitlements";
import UpgradeButton from "./upgrade-button";
import ManageSubscriptionButton from "./manage-subscription-button";

export const metadata = { title: "Plan" };

const PLUS_BENEFITS = [
  "Remove the “made with Inklee” footer from your public pages",
  "Customise your booking email templates",
  "Up to 30 custom form fields, 100 guest-spot trips, and 50 studios",
  "Advanced booking analytics",
];

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
            <span className="rounded-full bg-brand-red/10 px-3 py-1 text-xs font-semibold text-brand-red">
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
                <span aria-hidden className="mt-0.5 text-brand-red">
                  &#10003;
                </span>
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <UpgradeButton label="Upgrade to Plus" />
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
                <span aria-hidden className="mt-0.5 text-brand-red">
                  &#10003;
                </span>
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <ManageSubscriptionButton />
          </div>
        </section>
      )}
    </div>
  );
}
