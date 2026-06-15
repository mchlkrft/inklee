import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useScrollHide } from "@/lib/scroll-hide";
import { useBookingsHeaderInset } from "@/lib/bookings-header";
import { TAB_BAR_CLEARANCE } from "@/components/BottomNav";
import { formatMoney } from "@/lib/bookings";
import { formatShortDate } from "@/lib/date";
import { useScreenView } from "@/lib/analytics";
import type {
  MobileDepositListItem,
  MobileDepositsResponse,
} from "@inklee/shared/mobile-api";

// Color-coded state chip — the at-a-glance "where's this deposit" cue.
const STATE_PILL: Record<
  MobileDepositListItem["state"],
  { bg: string; text: string; label: string }
> = {
  overdue: { bg: "bg-danger/15", text: "text-danger-fg", label: "Overdue" },
  awaiting: { bg: "bg-mustard/15", text: "text-accent", label: "Awaiting" },
  paid: { bg: "bg-success/15", text: "text-success-fg", label: "Paid" },
  refunded: { bg: "bg-shell-hover", text: "text-shell-dim", label: "Refunded" },
};

function DepositCard({
  d,
  onPress,
}: {
  d: MobileDepositListItem;
  onPress: () => void;
}) {
  const pill = STATE_PILL[d.state];
  const sub =
    d.state === "paid" && d.paidAt
      ? `Paid ${formatShortDate(d.paidAt)}`
      : d.state === "refunded"
        ? "Returned to client"
        : d.dueAt
          ? `Due ${formatShortDate(d.dueAt)}`
          : "No due date";
  return (
    <View className="mb-2">
      <Card onPress={onPress}>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text
              className="text-base font-semibold text-foreground"
              numberOfLines={1}
            >
              {d.client}
            </Text>
            <View className="mt-1.5 flex-row items-center gap-2">
              <View className={`rounded-full px-2 py-0.5 ${pill.bg}`}>
                <Text className={`text-xs font-semibold ${pill.text}`}>
                  {pill.label}
                </Text>
              </View>
              <Text className="text-xs text-shell-dim" numberOfLines={1}>
                {sub}
                {d.card ? " · Card" : " · Manual"}
              </Text>
            </View>
          </View>
          <Text className="text-base font-bold text-foreground">
            {formatMoney(d.amount, d.currency)}
          </Text>
        </View>
      </Card>
    </View>
  );
}

// Header rollup tile: a money figure over a count, so the artist sees what
// they're owed vs what's landed before scanning the rows.
function SummaryTile({
  label,
  amount,
  currency,
  sub,
}: {
  label: string;
  amount: number;
  currency: string;
  sub: string;
}) {
  return (
    <View className="flex-1 rounded-card border-brand border-shell-border bg-card p-4">
      <Text
        className="text-overline uppercase text-shell-mute"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        className="mt-1 text-xl font-bold text-foreground"
        numberOfLines={1}
      >
        {formatMoney(amount, currency)}
      </Text>
      <Text className="mt-0.5 text-caption text-shell-dim" numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-shell-mute">
      {children}
    </Text>
  );
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// Deposits overview (the Bookings sub-view the web has no standalone page for).
// Cross-booking list of every deposit, grouped Outstanding / Collected with
// money rollups up top. Each row taps through to the booking detail, where the
// actual request / mark-received / refund actions live.
export default function DepositsScreen() {
  useScreenView("deposits");
  const router = useRouter();
  const colors = useColors();
  const onScroll = useScrollHide();
  const headerInset = useBookingsHeaderInset();
  const q = useApiQuery<MobileDepositsResponse>("/bookings/deposits");

  const data = q.data;
  const outstanding = (data?.items ?? []).filter(
    (i) => i.state === "awaiting" || i.state === "overdue",
  );
  const settled = (data?.items ?? []).filter(
    (i) => i.state === "paid" || i.state === "refunded",
  );

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: headerInset,
          paddingBottom: TAB_BAR_CLEARANCE,
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
        ) : data.items.length === 0 ? (
          <View className="py-16">
            <EmptyState
              title="No deposits yet"
              subtitle="Accept a request, then tap Request deposit on the booking to collect one."
            />
          </View>
        ) : (
          <>
            <View className="flex-row gap-2 pt-1">
              <SummaryTile
                label="Outstanding"
                amount={data.summary.outstandingAmount}
                currency={data.summary.currency}
                sub={plural(data.summary.outstandingCount, "deposit", "deposits")}
              />
              <SummaryTile
                label="Collected"
                amount={data.summary.collectedAmount}
                currency={data.summary.currency}
                sub={plural(data.summary.collectedCount, "paid", "paid")}
              />
            </View>

            {outstanding.length > 0 ? (
              <>
                <SectionLabel>Outstanding</SectionLabel>
                {outstanding.map((d) => (
                  <DepositCard
                    key={d.bookingId}
                    d={d}
                    onPress={() => router.push(`/bookings/${d.bookingId}`)}
                  />
                ))}
              </>
            ) : null}

            {settled.length > 0 ? (
              <>
                <SectionLabel>Collected</SectionLabel>
                {settled.map((d) => (
                  <DepositCard
                    key={d.bookingId}
                    d={d}
                    onPress={() => router.push(`/bookings/${d.bookingId}`)}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
