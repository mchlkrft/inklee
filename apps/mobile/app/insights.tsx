import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery } from "@/lib/api";
import { MONTH_LONG } from "@/lib/date";
import { CAP } from "@/lib/layout";
import { useColors } from "@/lib/theme";
import type { MobileAnalytics } from "@inklee/shared/mobile-api";

const RANGES = [
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "all", label: "All time" },
];

export default function InsightsScreen() {
  const [range, setRange] = useState("90");
  const themed = useColors();
  const { data, loading, error, refreshing, refresh } = useApiQuery<MobileAnalytics>(
    `/analytics?range=${range}`,
    { keepPrevious: true },
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        padding: 20,
        paddingBottom: 40,
        width: "100%",
        maxWidth: CAP.wide + 40,
        alignSelf: "center",
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={themed.accent}
        />
      }
    >
      <View className="mb-5 flex-row gap-2">
        {RANGES.map((r) => {
          const active = r.key === range;
          return (
            <Pressable
              key={r.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setRange(r.key)}
              className={`h-11 flex-1 items-center justify-center rounded-xl border px-3 ${
                active
                  ? "border-accent bg-mustard/15"
                  : "border-shell-border active:opacity-80"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  active ? "text-accent" : "text-shell-dim"
                }`}
              >
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!data ? (
        loading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={themed.accent} />
          </View>
        ) : (
          <ErrorState
            title="Couldn't load insights"
            subtitle={error ?? undefined}
            onRetry={refresh}
          />
        )
      ) : data.total === 0 ? (
        <EmptyState
          title="No data yet"
          subtitle="Insights appear once you start getting booking requests."
        />
      ) : (
        <>
          <View className="mb-3 flex-row gap-3">
            <Metric label="Requests" value={String(data.total)} />
            <Metric
              label="Conversion"
              value={`${data.conversionRate}%`}
              sub={`${data.approved} accepted`}
            />
          </View>
          <View className="mb-3 flex-row gap-3">
            <Metric label="Unique clients" value={String(data.uniqueClients)} />
            <Metric
              label="Return rate"
              value={`${data.returnRate}%`}
              sub={`${data.repeatClients} repeat`}
            />
          </View>
          <View className="mb-6 flex-row gap-3">
            <Metric
              label="Deposit rate"
              value={data.depositRate != null ? `${data.depositRate}%` : "-"}
              sub={`${data.depositPaid}/${data.depositRequested} paid`}
            />
            <Metric
              label="Passed"
              value={`${data.rejectionRate}%`}
              sub={`${data.rejected} passed`}
            />
          </View>

          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-shell-mute">
            Requests per month
          </Text>
          <Card>
            <MonthsChart months={data.months} />
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View className="flex-1">
      <Card>
        <Text className="text-2xl font-bold text-accent">{value}</Text>
        <Text className="mt-0.5 text-xs text-shell-dim">{label}</Text>
        {/* Always reserve the sub line so paired cards stay the same height. */}
        <Text
          className="mt-0.5 text-[11px] text-shell-mute"
          numberOfLines={1}
        >
          {sub ?? " "}
        </Text>
      </Card>
    </View>
  );
}

function MonthsChart({
  months,
}: {
  months: { month: string; count: number }[];
}) {
  if (months.length === 0) {
    return <Text className="text-sm text-shell-dim">No data yet.</Text>;
  }
  const max = Math.max(...months.map((m) => m.count), 1);
  return (
    <View className="flex-row items-end gap-2" style={{ height: 140 }}>
      {months.map((m) => (
        <View key={m.month} className="flex-1 items-center justify-end">
          <Text className="mb-1 text-xs text-shell-dim">{m.count}</Text>
          <View
            className="w-full rounded-t bg-mustard"
            style={{ height: Math.max(4, (m.count / max) * 100) }}
          />
          <Text className="mt-1 text-[10px] text-shell-mute">
            {monthLabel(m.month)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// "2026-06" → "Jun"
function monthLabel(yyyyMm: string): string {
  const m = Number(yyyyMm.slice(5, 7));
  return MONTH_LONG[m - 1]?.slice(0, 3) ?? yyyyMm;
}
