import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { useBookingsHeaderInset } from "@/lib/bookings-header";
import { useTabBarClearance } from "@/lib/layout";
import { formatMoneyShort } from "@/lib/bookings";
import { formatShortDate } from "@/lib/date";
import { useScreenView } from "@/lib/analytics";
import type {
  MobileDepositListItem,
  MobileDepositsResponse,
} from "@inklee/shared/mobile-api";

// The when-line under the client name: relative for outstanding rows (server-
// computed dueLabel), absolute for settled rows.
function whenLabel(d: MobileDepositListItem): string {
  if (d.state === "paid")
    return d.paidAt ? `Paid ${formatShortDate(d.paidAt)}` : "Paid";
  if (d.state === "refunded") return "Returned to client";
  if (d.state === "cancelled") return "Cancelled";
  return d.dueLabel ?? "No due date";
}

function DepositRow({
  d,
  onPress,
}: {
  d: MobileDepositListItem;
  onPress: () => void;
}) {
  const overdue = d.state === "overdue";
  return (
    <Pressable
      onPress={onPress}
      className={`mb-2 flex-row items-center justify-between gap-3 rounded-card border-brand px-4 py-3.5 active:opacity-70 ${
        overdue
          ? "border-danger/40 bg-danger/10"
          : "border-shell-border bg-card"
      }`}
    >
      <View className="flex-1">
        <Text
          className="text-base font-semibold text-foreground"
          numberOfLines={1}
        >
          {d.client}
        </Text>
        <Text
          className={`mt-0.5 text-xs ${overdue ? "text-danger-fg" : "text-shell-dim"}`}
          numberOfLines={1}
        >
          {whenLabel(d)}
        </Text>
      </View>
      <Text className="text-base font-bold text-foreground">
        {formatMoneyShort(d.amount, d.currency)}
      </Text>
    </Pressable>
  );
}

function SectionLabel({
  children,
  danger = false,
}: {
  children: string;
  danger?: boolean;
}) {
  return (
    <Text
      className={`mb-2 mt-6 text-xs font-semibold uppercase tracking-widest ${
        danger ? "text-danger-fg" : "text-shell-mute"
      }`}
    >
      {children}
    </Text>
  );
}

function Section({
  title,
  items,
  danger = false,
  onRow,
}: {
  title: string;
  items: MobileDepositListItem[];
  danger?: boolean;
  onRow: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <SectionLabel danger={danger}>{`${title} ${items.length}`}</SectionLabel>
      {items.map((d) => (
        <DepositRow key={d.bookingId} d={d} onPress={() => onRow(d.bookingId)} />
      ))}
    </>
  );
}

// A tappable pointer into the Settings stack. Deposit config is split across two
// screens there (defaults + policy), so each gets its own pointer rather than
// one card promising more than its destination holds.
function SettingsPointer({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Card onPress={onPress}>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-base font-medium text-foreground">{title}</Text>
          <Text className="mt-0.5 text-xs text-shell-dim">{subtitle}</Text>
        </View>
        <ChevronRight size={18} color={colors.shell.mute} />
      </View>
    </Card>
  );
}

// Deposits chase overview (the Bookings sub-view, mirrored on web at
// /bookings/deposits). One hero Outstanding figure with Overdue broken out
// louder, then state-grouped rows (Overdue / Awaiting / Collected / Refunded),
// each with a count. Read-only: rows tap through to the booking detail where
// the request / mark-received / refund actions live. Data + classification come
// from the shared getDepositsOverview builder (one source of truth with web).
export default function DepositsScreen() {
  useScreenView("deposits");
  const router = useRouter();
  const colors = useColors();
  const onScroll = useScrollHide();
  const headerInset = useBookingsHeaderInset();
  const tabBarClearance = useTabBarClearance();
  const q = useApiQuery<MobileDepositsResponse>("/bookings/deposits");

  const data = q.data;
  const items = data?.items ?? [];
  const summary = data?.summary;
  const overdue = items.filter((i) => i.state === "overdue");
  const awaiting = items.filter((i) => i.state === "awaiting");
  const collected = items.filter((i) => i.state === "paid");
  const cancelled = items.filter((i) => i.state === "cancelled");
  const refunded = items.filter((i) => i.state === "refunded");
  const hasOutstanding = (summary?.outstandingCount ?? 0) > 0;
  const openBooking = (id: string) => router.push(`/bookings/${id}`);

  return (
    <Screen edges={["left", "right"]} column="feed">
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: headerInset,
          paddingBottom: tabBarClearance,
        }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={colors.accent}
            progressViewOffset={headerInset}
          />
        }
      >
        {!data ? (
          q.loading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View className="py-16">
              <EmptyState
                title="Couldn't load deposits"
                subtitle={q.error ?? undefined}
              />
            </View>
          )
        ) : items.length === 0 ? (
          <View className="py-16">
            <EmptyState
              title="No deposits yet"
              subtitle="Accept a request, then choose Request deposit on the booking to collect one."
            />
          </View>
        ) : (
          <>
            {/* Hero: Outstanding is the one number; overdue louder, Collected
                demoted to a quiet line. */}
            <View className="mt-1 rounded-card border-brand border-shell-border bg-card p-5">
              {hasOutstanding ? (
                <>
                  <Text className="text-overline uppercase text-shell-mute">
                    Outstanding
                  </Text>
                  <Text className="mt-1 text-display font-bold text-foreground">
                    {formatMoneyShort(
                      summary!.outstandingAmount,
                      summary!.currency,
                    )}
                  </Text>
                  {summary!.overdueCount > 0 ? (
                    <Text className="mt-1 text-sm font-semibold text-danger-fg">
                      {summary!.overdueCount} overdue ·{" "}
                      {formatMoneyShort(
                        summary!.overdueAmount,
                        summary!.currency,
                      )}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text className="text-base font-semibold text-foreground">
                    Nothing to chase
                  </Text>
                  <Text className="mt-1 text-sm text-shell-dim">
                    You&apos;re all caught up.
                  </Text>
                </>
              )}
              <Text className="mt-3 border-t border-shell-border pt-3 text-sm text-shell-dim">
                Collected{" "}
                {formatMoneyShort(summary!.collectedAmount, summary!.currency)}
              </Text>
            </View>

            <Section
              title="Overdue"
              items={overdue}
              danger
              onRow={openBooking}
            />
            <Section title="Awaiting" items={awaiting} onRow={openBooking} />
            <Section title="Collected" items={collected} onRow={openBooking} />
            <Section title="Cancelled" items={cancelled} onRow={openBooking} />
            <Section title="Refunded" items={refunded} onRow={openBooking} />

            {/* Pointers to the deposit configuration, split across the two
                Settings screens it actually lives on. */}
            <View className="mt-6 gap-2">
              <SettingsPointer
                title="Deposit defaults"
                subtitle="Default amount, due window, and note to the client."
                onPress={() => router.push("/settings/deposit-defaults")}
              />
              <SettingsPointer
                title="Cancellation & refunds"
                subtitle="Your refund window and late-cancel terms."
                onPress={() => router.push("/settings/deposit-policy")}
              />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
