import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
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
    .select("first_name, last_name, display_name, booking_mode")
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
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your identity and account security.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3">
          Booking mode
        </h2>
        <div className="flex items-center justify-between rounded-[20px] border border-border px-5 py-4">
          <div>
            <p className="text-sm text-foreground">
              {profile?.booking_mode === "fixed_slots"
                ? "Fixed slots"
                : "Preferred date"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {profile?.booking_mode === "fixed_slots"
                ? "You publish specific time slots for clients to pick."
                : "Clients suggest a date — you confirm or negotiate."}
            </p>
          </div>
          <Link
            href="/bookings/settings"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            Edit in Booking Settings &rarr;
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3">
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
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3">
          Security
        </h2>
        <SecurityForm hasPassword={hasPassword} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3">
          Two-factor authentication
        </h2>
        <TwoFactorSection
          isEnabled={mfaEnabled}
          factorId={totpFactor?.id ?? null}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border pb-3">
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
            className="inline-block rounded-md border border-border px-4 py-2 text-sm text-muted-foreground"
          >
            Download export
          </a>
        </div>
      </section>
    </div>
  );
}
