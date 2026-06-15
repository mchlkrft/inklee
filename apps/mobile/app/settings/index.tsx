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
import { Pencil } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { IconButton } from "@/components/IconButton";
import { SectionLabel } from "@/components/SectionLabel";
import { SettingsRow } from "@/components/SettingsRow";
import { Segmented } from "@/components/Segmented";
import { useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { formatMoney } from "@/lib/bookings";
import {
  useColors,
  useThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import type { DepositDefaults } from "@inklee/shared/deposit-settings";
import type {
  MobileMe,
  MobileProfile,
  MobilePayouts,
} from "@inklee/shared/mobile-api";

// Settings hub — the account / configuration surface, reached from the top-bar
// account menu. Re-homes everything the old More tab held except the Flash /
// Guest Spots / Goods links (now bottom-nav tabs). Title comes from the native
// stack header ("Settings"). The full-parity build (Bio page, Emails, Calendar,
// Home widgets) adds rows + screens here later.
const BASE = config.apiUrl;

const PAYOUT_STATUS: Record<string, { label: string; tone: string }> = {
  unset: { label: "Not set up", tone: "text-shell-dim" },
  pending: { label: "Pending review", tone: "text-accent" },
  active: { label: "Active", tone: "text-success-fg" },
  restricted: { label: "Action needed", tone: "text-danger-fg" },
  disabled: { label: "Disabled", tone: "text-danger-fg" },
};

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// openURL rejects on Android when nothing can handle the link; swallow it so a
// tap on an external link never throws an unhandled rejection.
const safeOpen = (url: string) => {
  void Linking.openURL(url).catch(() => {});
};

export default function SettingsHubScreen() {
  useScreenView("settings");
  const { signOut } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const themed = useColors();
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
      <Screen edges={["left", "right"]}>
        {meQ.loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={themed.accent} />
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
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={themed.accent}
          />
        }
      >
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
                <Text className="text-lg font-bold text-accent">
                  {name.charAt(0).toUpperCase() || "·"}
                </Text>
              </View>
            )}
            <View className="flex-1">
              <Text className="text-lg font-semibold text-foreground">{name}</Text>
              {subline ? (
                <Text className="text-sm text-shell-dim" numberOfLines={1}>
                  {subline}
                </Text>
              ) : null}
            </View>
            {/* Founder round 7: profile editing lives ON the identity card. */}
            <IconButton
              icon={Pencil}
              label="Edit profile"
              outlined
              iconSize={16}
              onPress={() => router.push("/settings/profile")}
            />
          </View>

          <View className="mt-3 flex-row gap-2">
            <View className="rounded-full bg-mustard/20 px-2.5 py-1">
              <Text className="text-xs font-semibold text-accent">
                {me.plan} plan
              </Text>
            </View>
            {me.canCollectDeposits ? (
              <View className="rounded-full bg-success/20 px-2.5 py-1">
                <Text className="text-xs font-semibold text-success-fg">
                  Deposits on
                </Text>
              </View>
            ) : null}
          </View>
        </Card>

        <SectionLabel>Booking</SectionLabel>
        <Card>
          <SettingsRow
            label="Booking settings"
            onPress={() => router.push("/settings/books")}
          />
          {me.bookingMode === "fixed_slots" ? (
            <SettingsRow
              label="Time slots"
              divider
              onPress={() => router.push("/settings/slots")}
            />
          ) : null}
          <SettingsRow
            label="Booking form"
            divider
            onPress={() => router.push("/settings/booking-form")}
          />
          <SettingsRow
            label="Emails"
            divider
            onPress={() => router.push("/settings/emails")}
          />
          {publicUrl ? (
            <SettingsRow
              label="View public page"
              external
              divider
              onPress={() => safeOpen(publicUrl)}
            />
          ) : null}
        </Card>

        <SectionLabel>Payments</SectionLabel>
        <Card>
          <SettingsRow
            label="Payouts"
            value={payout?.label ?? null}
            valueTone={payout?.tone ?? "text-shell-dim"}
            onPress={() => router.push("/settings/payouts")}
          />
          <SettingsRow
            label="Deposit defaults"
            value={depositSummary}
            divider
            onPress={() => router.push("/settings/deposit-defaults")}
          />
          <SettingsRow
            label="Cancellation & refunds"
            divider
            onPress={() => router.push("/settings/deposit-policy")}
          />
        </Card>

        <SectionLabel>Tools</SectionLabel>
        <Card>
          <SettingsRow
            label="Link Hub"
            onPress={() => router.push("/settings/link-hub")}
          />
          <SettingsRow
            label="Insights"
            divider
            onPress={() => router.push("/insights")}
          />
          <SettingsRow
            label="Waitlist"
            divider
            onPress={() => router.push("/waitlist")}
          />
          <SettingsRow
            label="Home widgets"
            divider
            onPress={() => router.push("/settings/dashboard")}
          />
          <SettingsRow
            label="Calendar export"
            divider
            onPress={() => router.push("/settings/calendar-export")}
          />
        </Card>

        <SectionLabel>Appearance</SectionLabel>
        <Card>
          <Segmented
            options={THEME_OPTIONS}
            value={preference}
            onChange={setPreference}
          />
          <Text className="text-xs text-shell-dim">
            System follows your phone&apos;s light or dark setting.
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

        {/* Account & security sits at the bottom (founder round 7); account
            deletion lives inside it, not on the hub. */}
        <SectionLabel>Account</SectionLabel>
        <Card>
          <SettingsRow
            label="Account & security"
            onPress={() => router.push("/settings/account")}
          />
        </Card>

        <View className="mt-8">
          <Button label="Sign out" variant="secondary" onPress={signOut} />
        </View>
      </ScrollView>
    </Screen>
  );
}
