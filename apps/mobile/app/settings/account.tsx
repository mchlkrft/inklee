import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileAccount } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ErrorState } from "@/components/ErrorState";
import { SectionLabel } from "@/components/SectionLabel";
import { SettingsRow } from "@/components/SettingsRow";
import { useApiQuery, apiPatch } from "@/lib/api";
import { useScreenView } from "@/lib/analytics";
import { captureError } from "@/lib/telemetry";
import { openConnectHandoff } from "@/lib/web-handoff";
import { useColors } from "@/lib/theme";

// Account & security — mirrors the web settings/account page (same section
// order). The name fields save through the mobile API; email, password, and
// two-factor management open the web account page signed in via a one-time
// link (the payouts connect-link pattern — those flows stay on the web), and
// the GDPR data export downloads through the same web route the browser uses.
// Account deletion keeps its dedicated full-screen re-auth flow.
export default function AccountSecurityScreen() {
  useScreenView("settings_account");
  const q = useApiQuery<MobileAccount>("/account");
  const themed = useColors();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load your account"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <AccountSections account={q.data} />;
}

function AccountSections({ account }: { account: MobileAccount }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState(account.firstName ?? "");
  const [lastName, setLastName] = useState(account.lastName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [opening, setOpening] = useState<null | "account" | "export">(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function saveName() {
    Keyboard.dismiss();
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await apiPatch("/account", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["api", "/account"] });
      setSaved(true);
    } catch (e) {
      captureError(e, { op: "saveAccountName" });
      setSaveError(
        e instanceof Error ? e.message : "Couldn't save. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Open a web settings page signed in via a one-time link (the same handoff
  // pattern as payout setup). Refresh /account afterwards so a change made on
  // the web (e.g. 2FA enabled, email changed) shows up here.
  async function openWeb(
    next: "/settings/account" | "/settings/export",
    op: "account" | "export",
  ) {
    if (opening) return;
    setOpening(op);
    setLinkError(null);
    try {
      await openConnectHandoff(next);
      await queryClient.invalidateQueries({ queryKey: ["api", "/account"] });
    } catch (e) {
      captureError(e, {
        op: op === "export" ? "openDataExport" : "openWebAccount",
      });
      setLinkError("Couldn't open the page. Try again.");
    } finally {
      setOpening(null);
    }
  }

  const providerName = account.oauthProvider
    ? account.oauthProvider.charAt(0).toUpperCase() +
      account.oauthProvider.slice(1)
    : null;

  return (
    <Screen edges={["left", "right"]} column="form">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
      >
        <SectionLabel>Booking mode</SectionLabel>
        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-base text-foreground">
                {account.bookingMode === "fixed_slots"
                  ? "Fixed slots"
                  : "Preferred date"}
              </Text>
              <Text className="mt-1 text-xs text-shell-dim">
                {account.bookingMode === "fixed_slots"
                  ? "You publish specific time slots for clients to pick."
                  : "Clients suggest a date. You confirm or negotiate."}
              </Text>
            </View>
            {/* Founder round 7: the mode is editable — it lives on the booking
                settings screen with the rest of availability. */}
            <Pressable
              onPress={() => router.push("/settings/books")}
              hitSlop={8}
              className="active:opacity-70"
            >
              <Text className="text-label font-medium text-accent">Edit</Text>
            </Pressable>
          </View>
        </Card>

        <SectionLabel>General</SectionLabel>
        <Card>
          <TextField
            label="First name"
            value={firstName}
            onChangeText={(t) => {
              setFirstName(t);
              setSaved(false);
            }}
            autoCapitalize="words"
            placeholder="e.g. Bert"
          />
          <TextField
            label="Last name"
            value={lastName}
            onChangeText={(t) => {
              setLastName(t);
              setSaved(false);
            }}
            autoCapitalize="words"
            placeholder="e.g. Grimm"
          />
          {saveError ? (
            <Text className="mb-3 text-sm text-danger-fg">{saveError}</Text>
          ) : saved ? (
            <Text className="mb-3 text-sm text-success-fg">Saved.</Text>
          ) : null}
          <Button label="Save" onPress={saveName} loading={saving} />
        </Card>

        <SectionLabel>Security</SectionLabel>
        <Card>
          <SettingsRow
            label="Two-factor authentication"
            value={account.mfaEnabled ? "On" : "Off"}
            valueTone={account.mfaEnabled ? "text-success-fg" : "text-shell-dim"}
            external
            onPress={() => openWeb("/settings/account", "account")}
          />
          <SettingsRow
            label="Change email"
            value={account.email}
            divider
            external
            onPress={() => openWeb("/settings/account", "account")}
          />
          {account.hasPassword ? (
            <SettingsRow
              label="Change password"
              divider
              external
              onPress={() => openWeb("/settings/account", "account")}
            />
          ) : null}
          {!account.hasPassword && providerName ? (
            <Text className="border-t border-shell-border pt-3 text-xs text-shell-dim">
              Your account uses {providerName} sign-in. Password authentication
              is not enabled.
            </Text>
          ) : null}
          <Text className="mt-2 text-xs text-shell-mute">
            These open your account page on the web, signed in automatically.
          </Text>
        </Card>

        <SectionLabel>Data export</SectionLabel>
        <Card>
          <Text className="text-sm text-shell-dim">
            Download all your bookings, client notes, custom fields, and audit
            log as JSON.
          </Text>
          <View className="mt-4">
            <Button
              label="Download export"
              variant="secondary"
              onPress={() => openWeb("/settings/export", "export")}
              loading={opening === "export"}
              disabled={opening !== null}
            />
          </View>
        </Card>

        {linkError ? (
          <Text className="mt-3 text-sm text-danger-fg">{linkError}</Text>
        ) : null}

        <SectionLabel>Delete account</SectionLabel>
        <Card>
          <SettingsRow
            label="Delete account"
            danger
            onPress={() => router.push("/account/delete")}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
