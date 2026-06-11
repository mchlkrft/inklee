import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { apiPost, invalidateBookingViews, useApiQuery } from "@/lib/api";
import { config } from "@/lib/config";
import { relativeTime } from "@/lib/date";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";
import { useColors } from "@/lib/theme";
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
  const queryClient = useQueryClient();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<MobileWaitlistResponse>(`/waitlist?status=${filter}`, {
      keepPrevious: true,
    });
  const me = useApiQuery<MobileMe>("/me");
  const waitlistUrl = me.data?.slug ? config.waitlistUrl(me.data.slug) : null;

  // A status change can drop an entry from the "waiting" list AND change the
  // Home waitlist count — refresh both views.
  function invalidate() {
    void queryClient.invalidateQueries({
      predicate: (q) => {
        const p = q.queryKey[1];
        return typeof p === "string" && (p.startsWith("/waitlist") || p === "/home");
      },
    });
  }

  // Optimistically update the entry's status in the current list so its pill +
  // actions change instantly; the invalidate after a successful POST then drops
  // it from the "waiting" filter and refreshes the Home count.
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
    patch(entryId, status);
    try {
      await apiPost(`/waitlist/${entryId}`, { status });
      invalidate();
    } catch (e) {
      patch(entryId, prevStatus); // revert
      throw e;
    }
  }

  // Convert creates an accepted booking + emails the client a magic link, so it
  // refreshes the booking views too (not just the waitlist + Home count).
  async function onConvert(entryId: string, prevStatus: string) {
    patch(entryId, "converted");
    try {
      await apiPost(`/waitlist/${entryId}/convert`);
      invalidate();
      void invalidateBookingViews(queryClient);
    } catch (e) {
      patch(entryId, prevStatus); // revert
      throw e;
    }
  }

  const items = data?.items ?? [];

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
              className={`flex-1 items-center rounded-xl border px-3 py-2.5 ${
                active
                  ? "border-mustard bg-mustard/15 active:opacity-80"
                  : "border-shell-border active:opacity-80"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  active ? "text-mustard" : "text-shell-dim"
                }`}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          waitlistUrl ? <ShareWaitlistCard url={waitlistUrl} /> : null
        }
        renderItem={({ item }) => (
          <WaitlistRow entry={item} onAction={onAction} onConvert={onConvert} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.mustard}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.mustard} />
            </View>
          ) : error ? (
            <ErrorState
              title="Couldn't load waitlist"
              subtitle={error}
              onRetry={refresh}
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
  onAction,
  onConvert,
}: {
  entry: MobileWaitlistEntry;
  onAction: (
    id: string,
    prev: string,
    status: "contacted" | "dismissed",
  ) => Promise<void>;
  onConvert: (id: string, prev: string) => Promise<void>;
}) {
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
      <Card>
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
                  <ActionBtn
                    label="Mark contacted"
                    loading={pending === "contacted"}
                    disabled={busy}
                    onPress={() => setStatus("contacted")}
                  />
                ) : null}
                {canDismiss ? (
                  <ActionBtn
                    label="Dismiss"
                    danger
                    loading={pending === "dismissed"}
                    disabled={busy}
                    onPress={() => setStatus("dismissed")}
                  />
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

function ActionBtn({
  label,
  onPress,
  loading,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
  danger?: boolean;
}) {
  const themed = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`h-10 flex-1 items-center justify-center rounded-xl border ${
        danger ? "border-danger/50" : "border-shell-border"
      } ${disabled ? "opacity-50" : "active:opacity-80"}`}
    >
      {loading ? (
        <ActivityIndicator color={danger ? colors.danger : themed.bone} />
      ) : (
        <Text
          className={`text-sm font-semibold ${danger ? "text-danger" : "text-foreground"}`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// Shareable public waitlist link (always shown, like web). Copy via clipboard,
// Preview via the in-app browser.
function ShareWaitlistCard({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View className="mb-3">
      <Card>
        <Text className="text-sm font-medium text-foreground">Waitlist link</Text>
        <Text className="mt-1 text-sm text-shell-dim" numberOfLines={1}>
          {url.replace(/^https?:\/\//, "")}
        </Text>
        <View className="mt-2 flex-row gap-2">
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded-full border border-shell-border px-3 py-1.5 active:opacity-70"
          >
            <Text className="text-label text-foreground">
              {copied ? "Copied" : "Copy link"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void WebBrowser.openBrowserAsync(url);
            }}
            className="rounded-full border border-shell-border px-3 py-1.5 active:opacity-70"
          >
            <Text className="text-label text-foreground">Preview</Text>
          </Pressable>
        </View>
      </Card>
    </View>
  );
}
