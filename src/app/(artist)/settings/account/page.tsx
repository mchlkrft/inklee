import { createClient } from "@/lib/supabase/server";
import GeneralForm from "./general-form";
import SecurityForm from "./security-form";
import TwoFactorSection from "./two-factor-section";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, display_name")
    .eq("id", user!.id)
    .single();

  // Detect whether the account has a password (vs Google-only)
  const identities = user?.identities ?? [];
  const hasPassword = identities.some((i) => i.provider === "email");

  // Check TOTP enrollment
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpFactor = factors?.totp?.[0] ?? null;
  const mfaEnabled = totpFactor?.status === "verified";

  return (
    <div className="space-y-10 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your identity and account security.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground border-b border-border pb-2">
          General
        </h2>
        <GeneralForm
          firstName={profile?.first_name ?? null}
          lastName={profile?.last_name ?? null}
          displayName={profile?.display_name ?? ""}
          email={user?.email ?? ""}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground border-b border-border pb-2">
          Security
        </h2>
        <SecurityForm hasPassword={hasPassword} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground border-b border-border pb-2">
          Two-factor authentication
        </h2>
        <TwoFactorSection
          isEnabled={mfaEnabled}
          factorId={totpFactor?.id ?? null}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-foreground border-b border-border pb-2">
          Data export
        </h2>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Download all your bookings, client notes, custom fields, and audit
            log as JSON.
          </p>
          <a
            href="/settings/export"
            download
            className="inline-block rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            Download export
          </a>
        </div>
      </section>
    </div>
  );
}
