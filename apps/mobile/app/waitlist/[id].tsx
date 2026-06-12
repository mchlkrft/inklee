import { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react-native";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { useApiQuery } from "@/lib/api";
import { convertWaitlistEntry, setWaitlistStatus } from "@/lib/waitlist";
import { formatShortDate, relativeTime } from "@/lib/date";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { customerLabel } from "@inklee/shared/booking-domain";
import type { MobileWaitlistEntry } from "@inklee/shared/mobile-api";

// Waitlist entry detail (founder round 4: entries were list-only, no subpage).
// Full note, city, contact, joined date, and the same actions as the list row.
// The web shows everything inline; this subpage is a mobile-first addition
// because small cards clamp the note and crowd the actions.
export default function WaitlistEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<MobileWaitlistEntry>(`/waitlist/${id}`);
  const themed = useColors();
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Optimistically flip this entry's own cache so the pill changes instantly;
  // the shared invalidation refreshes the list + Home count behind it.
  function patchSelf(status: string) {
    queryClient.setQueryData<MobileWaitlistEntry>(["api", `/waitlist/${id}`], (old) =>
      old ? { ...old, status } : old,
    );
  }

  async function setStatus(status: "contacted" | "dismissed") {
    if (!data) return;
    const prev = data.status;
    setPending(status);
    setActionError(null);
    // Cancel any in-flight detail refetch (a previous action's invalidation)
    // so its stale snapshot can't clobber this optimistic patch.
    await queryClient.cancelQueries({ queryKey: ["api", `/waitlist/${id}`] });
    patchSelf(status);
    try {
      await setWaitlistStatus(queryClient, data.id, status);
    } catch (e) {
      captureError(e, { op: "waitlistStatusDetail" });
      patchSelf(prev);
      setActionError("Couldn't update. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function convert() {
    if (!data) return;
    const prev = data.status;
    setPending("convert");
    setActionError(null);
    await queryClient.cancelQueries({ queryKey: ["api", `/waitlist/${id}`] });
    patchSelf("converted");
    try {
      await convertWaitlistEntry(queryClient, data.id);
    } catch (e) {
      captureError(e, { op: "waitlistConvertDetail" });
      patchSelf(prev);
      setActionError("Couldn't move to booking. Try again.");
    } finally {
      setPending(null);
    }
  }

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-5">
        {loading ? (
          <ActivityIndicator color={themed.accent} />
        ) : (
          <View className="items-center">
            <EmptyState
              title="Couldn't load this entry"
              subtitle={error ?? undefined}
            />
            <View className="mt-2">
              <Button label="Try again" variant="secondary" size="sm" onPress={refresh} />
            </View>
          </View>
        )}
      </View>
    );
  }

  const label = customerLabel(data.customer_handle, data.customer_email);
  const showEmail = !!data.customer_email && label !== data.customer_email;
  const isWaiting = data.status === "waiting";
  const canDismiss = data.status === "waiting" || data.status === "contacted";
  const canConvert =
    (data.status === "waiting" || data.status === "contacted") &&
    !!data.customer_email;
  const busy = pending !== null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={themed.accent}
        />
      }
    >
      {/* Header: avatar initial + label + status, the client-detail language. */}
      <View className="flex-row items-center gap-4">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-mustard/20">
          <Text className="text-2xl font-bold text-accent">
            {label.replace(/^@/, "").charAt(0).toUpperCase() || "·"}
          </Text>
        </View>
        <View className="flex-1">
          <Text
            className="text-display font-bold text-foreground"
            numberOfLines={1}
          >
            {label}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <StatusPill status={data.status} />
          </View>
        </View>
      </View>

      <View className="mt-6 gap-4">
        {showEmail ? <Field label="Email" value={data.customer_email} /> : null}
        {data.city_text ? (
          <View>
            <Text className="text-sm text-shell-mute">City</Text>
            <View className="mt-0.5 flex-row items-center gap-1.5">
              <MapPin size={14} color={themed.shell.dim} />
              <Text className="text-base text-foreground">{data.city_text}</Text>
            </View>
          </View>
        ) : null}
        {data.note ? <Field label="Note" value={data.note} /> : null}
        <Field
          label="Joined"
          value={`${formatShortDate(data.created_at)} (${relativeTime(data.created_at)})`}
        />
      </View>

      {canConvert || isWaiting || canDismiss ? (
        <View className="mt-8 gap-2">
          {canConvert ? (
            <Button
              label="Move to booking"
              loading={pending === "convert"}
              disabled={busy}
              onPress={convert}
            />
          ) : null}
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
        </View>
      ) : null}
      {data.status === "converted" ? (
        <View className="mt-8">
          <Button
            label="View requests"
            variant="secondary"
            onPress={() => router.push("/bookings")}
          />
        </View>
      ) : null}
      {actionError ? (
        <Text className="mt-2 text-sm text-danger-fg">{actionError}</Text>
      ) : null}
    </ScrollView>
  );
}

// Founder ME-5: same 14/16 field standard as the booking detail.
function Field({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-sm text-shell-mute">{label}</Text>
      <Text className="mt-0.5 text-base text-foreground">{value}</Text>
    </View>
  );
}
