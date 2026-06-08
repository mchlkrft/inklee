import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { SettingsRow } from "@/components/SettingsRow";
import { useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { formatMoney } from "@/lib/bookings";
import { colors } from "@/lib/tokens";
import type { DepositDefaults } from "@inklee/shared/deposit-settings";
import type {
  MobileMe,
  MobileProfile,
  MobilePayouts,
} from "@inklee/shared/mobile-api";

// The apex origin the app talks to (e.g. https://inkl.ee) — proven on-device.
// It serves the API and the legal pages; the public bio page is a subdomain.
const BASE = config.apiUrl;

const PAYOUT_STATUS: Record<string, { label: string; tone: string }> = {
  unset: { label: "Not set up", tone: "text-shell-dim" },
  pending: { label: "Pending review", tone: "text-mustard" },
  active: { label: "Active", tone: "text-success" },
  restricted: { label: "Action needed", tone: "text-danger" },
  disabled: { label: "Disabled", tone: "text-danger" },
};

// openURL rejects on Android when nothing can handle the link; swallow it so we
// never throw an unhandled rejection for a tap on an external link.
const safeOpen = (url: string) => {
  void Linking.openURL(url).catch(() => {});
};

export default function MoreScreen() {
  const { signOut } = useAuth();
  const router = useRouter();
  const meQ = useApiQuery<MobileMe>("/me");
  const profileQ = useApiQuery<MobileProfile>("/settings/profile");
  const payoutsQ = useApiQuery<MobilePayouts>("/settings/payouts");
  const depositsQ = useApiQuery<DepositDefaults>("/settings/deposit-defaults");
  const [avatarFailed, setAvatarFailed] = useState(false);

  const me = meQ.data;
  const profile = profileQ.data;
  const payouts = payoutsQ.data;
  const deposits = depositsQ.data;

  // Gate on /me — the identity load. A 404 on /settings/profile (artist with no
  // profile row) is non-fatal: we fall back to /me's name + slug.
  if (!me) {
    return (
      <Screen>
        <Text className="py-2 text-2xl font-bold text-bone">More</Text>
        {meQ.loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.mustard} />
          </View>
        ) : (
          <ErrorState
            title="Couldn't load your account"
            subtitle={meQ.error ?? undefined}
            onRetry={meQ.refresh}
          />
        )}
      </Screen>
    );
  }

  const name = profile?.displayName || me.displayName || "Your account";
  const slug = me.slug ?? profile?.slug ?? null;
  const subline = profile?.instagramHandle
    ? `@${profile.instagramHandle}`
    : (profile?.location ?? (slug ? `${slug}.inkl.ee` : null));

  // Public bio page = a subdomain of the apex (e.g. https://jane.inkl.ee).
  const publicUrl = slug ? config.publicUrl(slug) : null;
  const showLogo = !!profile?.logoUrl && !avatarFailed;

  const payout = payouts
    ? (PAYOUT_STATUS[payouts.status] ?? PAYOUT_STATUS.unset)
    : null;
  const depositSummary =
    deposits && deposits.amount != null
      ? `${formatMoney(deposits.amount, "eur")} · due in ${deposits.due_days}d`
      : deposits
        ? "Not set"
        : null;

  const refreshing =
    meQ.refreshing ||
    profileQ.refreshing ||
    payoutsQ.refreshing ||
    depositsQ.refreshing;
  const refreshAll = () => {
    meQ.refresh();
    profileQ.refresh();
    payoutsQ.refresh();
    depositsQ.refresh();
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={colors.mustard}
          />
        }
      >
        <Text className="py-2 text-2xl font-bold text-bone">More</Text>

        <Card>
          <View className="flex-row items-center gap-3">
            {showLogo ? (
              <Image
                source={{ uri: profile!.logoUrl! }}
                onError={() => setAvatarFailed(true)}
                transition={150}
                style={{ width: 48, height: 48, borderRadius: 24 }}
                contentFit="cover"
              />
            ) : (
              <View className="h-12 w-12 items-center justify-center rounded-full bg-mustard/20">
                <Text className="text-lg font-bold text-mustard">
                  {name.charAt(0).toUpperCase() || "·"}
                </Text>
              </View>
            )}
            <View className="flex-1">
              <Text className="text-lg font-semibold text-bone">{name}</Text>
              {subline ? (
                <Text className="text-sm text-shell-dim" numberOfLines={1}>
                  {subline}
                </Text>
              ) : null}
            </View>
          </View>

          <View className="mt-3 flex-row gap-2">
            <View className="rounded-full bg-mustard/20 px-2.5 py-1">
              <Text className="text-xs font-semibold text-mustard">
                {me.plan} plan
              </Text>
            </View>
            {me.canCollectDeposits ? (
              <View className="rounded-full bg-success/20 px-2.5 py-1">
                <Text className="text-xs font-semibold text-success">
                  Deposits on
                </Text>
              </View>
            ) : null}
          </View>
        </Card>

        <SectionLabel>Grow</SectionLabel>
        <Card>
          <SettingsRow
            label="Insights"
            onPress={() => router.push("/insights")}
          />
          <SettingsRow
            label="Waitlist"
            divider
            onPress={() => router.push("/waitlist")}
          />
        </Card>

        <SectionLabel>Account</SectionLabel>
        <Card>
          {publicUrl ? (
            <SettingsRow
              label="View public page"
              external
              onPress={() => safeOpen(publicUrl)}
            />
          ) : null}
          <SettingsRow
            label="Timezone"
            value={me.timezone}
            divider={!!publicUrl}
          />
          <SettingsRow
            label="Delete account"
            danger
            divider
            onPress={() => router.push("/account/delete")}
          />
        </Card>

        <SectionLabel>Payments</SectionLabel>
        <Card>
          <SettingsRow
            label="Payout status"
            value={payout?.label ?? null}
            valueTone={payout?.tone ?? "text-shell-dim"}
          />
          <SettingsRow label="Default deposit" value={depositSummary} divider />
          <Text className="mt-2 text-xs text-shell-mute">
            Set up payouts and deposit defaults on the web for now.
          </Text>
        </Card>

        <SectionLabel>About</SectionLabel>
        <Card>
          <SettingsRow
            label="Terms"
            external
            onPress={() => safeOpen(`${BASE}/terms`)}
          />
          <SettingsRow
            label="Privacy"
            external
            divider
            onPress={() => safeOpen(`${BASE}/privacy`)}
          />
          <SettingsRow
            label="Imprint"
            external
            divider
            onPress={() => safeOpen(`${BASE}/imprint`)}
          />
        </Card>

        <View className="mt-8">
          <Button label="Sign out" variant="secondary" onPress={signOut} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-shell-mute">
      {children}
    </Text>
  );
}
