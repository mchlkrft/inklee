import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react-native";
import { Card } from "@/components/Card";
import { CardHeader } from "@/components/CardHeader";
import { Button } from "@/components/Button";
import { PillButton } from "@/components/PillButton";
import { FilterChip } from "@/components/Chip";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery } from "@/lib/api";
import {
  buildCityDemand,
  cityKey,
  convertWaitlistEntry,
  setWaitlistStatus,
} from "@/lib/waitlist";
import { config, displayUrl } from "@/lib/config";
import { relativeTime } from "@/lib/date";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { customerLabel } from "@inklee/shared/booking-domain";
import type {
  MobileMe,
  MobileWaitlistEntry,
  MobileWaitlistResponse,
} from "@inklee/shared/mobile-api";

const FILTERS = [
  { key: "waiting", label: "Waiting" },
  { key: "all", label: "All" },
];

export default function WaitlistScreen() {
  const [filter, setFilter] = useState("waiting");
  const [city, setCity] = useState<string | null>(null);
  const themed = useColors();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<MobileWaitlistResponse>(`/waitlist?status=${filter}`, {
      keepPrevious: true,
    });
  // The full set powers the city chips + demand card regardless of the status
  // filter (same cache key the "All" chip uses, so no extra cost once visited).
  const all = useApiQuery<MobileWaitlistResponse>("/waitlist?status=all", {
    keepPrevious: true,
  });
  const me = useApiQuery<MobileMe>("/me");
  const waitlistUrl = me.data?.slug ? config.waitlistUrl(me.data.slug) : null;

  // Optimistically update the entry's status in the current list so its pill +
  // actions change instantly; the shared invalidation after a successful POST
  // then drops it from the "waiting" filter and refreshes the Home count.
  function patch(entryId: string, status: string) {
    queryClient.setQueryData<MobileWaitlistResponse>(
      ["api", `/waitlist?status=${filter}`],
      (old) =>
        old
          ? {
              items: old.items.map((e) =>
                e.id === entryId ? { ...e, status } : e,
              ),
            }
          : old,
    );
  }

  async function onAction(
    entryId: string,
    prevStatus: string,
    status: "contacted" | "dismissed",
  ) {
    // Cancel any in-flight list refetch (a previous action's invalidation) so
    // its stale snapshot can't clobber this optimistic patch.
    await queryClient.cancelQueries({
      queryKey: ["api", `/waitlist?status=${filter}`],
    });
    patch(entryId, status);
    try {
      await setWaitlistStatus(queryClient, entryId, status);
    } catch (e) {
      patch(entryId, prevStatus); // revert
      throw e;
    }
  }

  async function onConvert(entryId: string, prevStatus: string) {
    await queryClient.cancelQueries({
      queryKey: ["api", `/waitlist?status=${filter}`],
    });
    patch(entryId, "converted");
    try {
      await convertWaitlistEntry(queryClient, entryId);
    } catch (e) {
      patch(entryId, prevStatus); // revert
      throw e;
    }
  }

  const demand = buildCityDemand(all.data?.items ?? []);
  const items = (data?.items ?? []).filter(
    (e) => !city || cityKey(e.city_text) === city,
  );

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row gap-2 px-5 pt-4">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(f.key)}
              className={`h-11 flex-1 items-center justify-center rounded-xl border px-3 ${
                active
                  ? "border-accent bg-mustard/15 active:opacity-80"
                  : "border-shell-border active:opacity-80"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  active ? "text-accent" : "text-shell-dim"
                }`}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* City filter: one chip per city, normalized the same way as the web
          demand card so "berlin" and "Berlin " group. No counts on the chips —
          they'd be all-time numbers next to a status-filtered list (the demand
          card below carries the counts, clearly scoped). */}
      {demand.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: 8,
            paddingHorizontal: 20,
            paddingTop: 12,
          }}
          // flexShrink 0: see the bookings chip strip — without it the
          // FlatList's flex basis squeezes this strip and clips the chips.
          style={{ flexGrow: 0, flexShrink: 0 }}
        >
          <FilterChip
            label="All cities"
            selected={city === null}
            onPress={() => setCity(null)}
          />
          {demand.map((d) => {
            const key = d.city.toLowerCase();
            return (
              <FilterChip
                key={key}
                label={d.city}
                selected={city === key}
                onPress={() => setCity(city === key ? null : key)}
              />
            );
          })}
        </ScrollView>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {waitlistUrl ? <ShareWaitlistCard url={waitlistUrl} /> : null}
            {demand.length > 0 ? <CityDemandCard demand={demand} /> : null}
          </>
        }
        renderItem={({ item }) => (
          <WaitlistRow
            entry={item}
            onOpen={() => router.push(`/waitlist/${item.id}`)}
            onAction={onAction}
            onConvert={onConvert}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              refresh();
              all.refresh();
            }}
            tintColor={themed.accent}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={themed.accent} />
            </View>
          ) : error ? (
            <ErrorState
              title="Couldn't load waitlist"
              subtitle={error}
              onRetry={refresh}
            />
          ) : city ? (
            <EmptyState
              title="No one here"
              subtitle="Try another city or clear the filter."
            />
          ) : (
            <EmptyState
              title="No one waiting"
              subtitle="People who join your waitlist will show up here."
            />
          )
        }
      />
    </View>
  );
}

function WaitlistRow({
  entry,
  onOpen,
  onAction,
  onConvert,
}: {
  entry: MobileWaitlistEntry;
  onOpen: () => void;
  onAction: (
    id: string,
    prev: string,
    status: "contacted" | "dismissed",
  ) => Promise<void>;
  onConvert: (id: string, prev: string) => Promise<void>;
}) {
  const themed = useColors();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function convert() {
    setPending("convert");
    setError(null);
    try {
      await onConvert(entry.id, entry.status);
    } catch (e) {
      captureError(e, { op: "waitlistConvert" });
      setError("Couldn't move to booking. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function setStatus(status: "contacted" | "dismissed") {
    setPending(status);
    setError(null);
    try {
      await onAction(entry.id, entry.status, status);
    } catch (e) {
      captureError(e, { op: "waitlistStatus" });
      setError("Couldn't update. Try again.");
    } finally {
      setPending(null);
    }
  }

  const label = customerLabel(entry.customer_handle, entry.customer_email);
  const isWaiting = entry.status === "waiting";
  const canDismiss = entry.status === "waiting" || entry.status === "contacted";
  const canConvert =
    (entry.status === "waiting" || entry.status === "contacted") &&
    !!entry.customer_email;
  const busy = pending !== null;

  return (
    <View className="mb-2">
      <Card onPress={onOpen}>
        <View className="mb-1 flex-row items-center justify-between gap-2">
          <Text
            className="flex-1 text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {label}
          </Text>
          <StatusPill status={entry.status} />
        </View>
        {entry.customer_email && label !== entry.customer_email ? (
          <Text className="text-sm text-shell-dim">{entry.customer_email}</Text>
        ) : null}
        {entry.city_text ? (
          <View className="mt-1 flex-row items-center gap-1">
            <MapPin size={12} color={themed.shell.dim} />
            <Text className="text-sm text-shell-dim" numberOfLines={1}>
              {entry.city_text}
            </Text>
          </View>
        ) : null}
        {entry.note ? (
          <Text className="mt-1 text-sm text-shell-dim" numberOfLines={2}>
            {entry.note}
          </Text>
        ) : null}
        <Text className="mt-1 text-xs text-shell-mute">
          Joined {relativeTime(entry.created_at)}
        </Text>

        {canConvert || isWaiting || canDismiss ? (
          <View className="mt-3 gap-2">
            {canConvert ? (
              <Button
                label="Move to booking"
                size="sm"
                loading={pending === "convert"}
                disabled={busy}
                onPress={convert}
              />
            ) : null}
            {isWaiting || canDismiss ? (
              <View className="flex-row gap-2">
                {isWaiting ? (
                  <View className="flex-1">
                    <Button
                      label="Mark contacted"
                      variant="secondary"
                      size="sm"
                      loading={pending === "contacted"}
                      disabled={busy}
                      onPress={() => setStatus("contacted")}
                    />
                  </View>
                ) : null}
                {canDismiss ? (
                  <View className="flex-1">
                    <Button
                      label="Dismiss"
                      variant="danger-outline"
                      size="sm"
                      loading={pending === "dismissed"}
                      disabled={busy}
                      onPress={() => setStatus("dismissed")}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
        {error ? (
          <Text className="mt-1 text-xs text-danger">{error}</Text>
        ) : null}
      </Card>
    </View>
  );
}

// Demand by city — the web waitlist insight card, natively: top cities with
// counts so guest spots can chase the demand.
function CityDemandCard({
  demand,
}: {
  demand: { city: string; count: number }[];
}) {
  const total = demand.reduce((sum, d) => sum + d.count, 0);
  const max = demand[0]?.count ?? 1;
  return (
    <View className="mb-3">
      <Card>
        <CardHeader icon={MapPin} tint="cobalt" title="Demand by city" />
        <View className="mt-3 gap-2">
          {demand.slice(0, 5).map((d) => (
            <View key={d.city} className="flex-row items-center gap-3">
              <Text className="w-24 text-sm text-foreground" numberOfLines={1}>
                {d.city}
              </Text>
              <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-shell-hover">
                <View
                  className="h-1.5 rounded-full bg-cobalt"
                  style={{ width: `${Math.round((d.count / max) * 100)}%` }}
                />
              </View>
              <Text className="w-6 text-right text-sm font-semibold text-foreground">
                {d.count}
              </Text>
            </View>
          ))}
        </View>
        <Text className="mt-3 text-caption text-shell-dim">
          {total} {total === 1 ? "person" : "people"} with a city on your
          waitlist
        </Text>
      </Card>
    </View>
  );
}

// Shareable public waitlist link (always shown, like web). Copy via clipboard,
// Preview via the in-app browser.
function ShareWaitlistCard({ url }: { url: string }) {
  const [copied, markCopied] = useTimedFlag();
  return (
    <View className="mb-3">
      <Card>
        <Text className="text-sm font-medium text-foreground">
          Waitlist link
        </Text>
        <Text className="mt-1 text-sm text-shell-dim" numberOfLines={1}>
          {displayUrl(url)}
        </Text>
        <View className="mt-2 flex-row gap-2">
          <PillButton
            label={copied ? "Copied" : "Copy link"}
            onPress={async () => {
              await Clipboard.setStringAsync(url);
              markCopied();
            }}
          />
          <PillButton
            label="Preview"
            onPress={() => {
              void WebBrowser.openBrowserAsync(url);
            }}
          />
        </View>
      </Card>
    </View>
  );
}
