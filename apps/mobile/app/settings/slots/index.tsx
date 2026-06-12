import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Clock } from "lucide-react-native";
import { slotStatusLabel } from "@inklee/shared/status-labels";
import type {
  MobileSlot,
  MobileSlotsResponse,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { SectionLabel } from "@/components/SectionLabel";
import { useApiQuery, apiDelete, invalidateSlots } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";

// Native slots manager — the app-side twin of the web /bookings/settings slots
// section, served by the same shared core (lib/server/slots.ts). Lists every
// slot grouped by day in the artist's timezone; open slots can be removed,
// locked / booked ones are read-only.

type DayGroup = { dateKey: string; dateLabel: string; items: MobileSlot[] };

function groupByDay(items: MobileSlot[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const slot of items) {
    const last = groups[groups.length - 1];
    if (last && last.dateKey === slot.dateKey) {
      last.items.push(slot);
    } else {
      groups.push({
        dateKey: slot.dateKey,
        dateLabel: slot.dateLabel,
        items: [slot],
      });
    }
  }
  return groups;
}

export default function SlotsScreen() {
  useScreenView("settings_slots");
  const router = useRouter();
  const queryClient = useQueryClient();
  const q = useApiQuery<MobileSlotsResponse>("/slots");
  const themed = useColors();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(
    () => (q.data ? groupByDay(q.data.items) : []),
    [q.data],
  );

  async function removeSlot(slot: MobileSlot) {
    setPendingId(slot.id);
    setError(null);
    try {
      await apiDelete(`/slots/${slot.id}`);
      await invalidateSlots(queryClient);
    } catch (e) {
      captureError(e, { op: "deleteSlot" });
      setError("Couldn't remove the slot. Try again.");
    } finally {
      setPendingId(null);
    }
  }

  function confirmRemove(slot: MobileSlot) {
    Alert.alert(
      "Remove slot",
      `Remove ${slot.timeLabel} on ${slot.dateLabel}? Clients can no longer pick this time.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void removeSlot(slot);
          },
        },
      ],
    );
  }

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load your slots"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={themed.accent}
          />
        }
      >
        <Text className="text-sm text-shell-dim">
          Clients pick one of these times on your public page. Times in{" "}
          {q.data.timezone}.
        </Text>

        <View className="mt-3">
          <Button
            label="Add slots"
            onPress={() => router.push("/settings/slots/new")}
          />
        </View>

        {error ? (
          <Text className="mt-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        {groups.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No slots yet"
            subtitle="Add your first slots so clients can book."
          />
        ) : (
          groups.map((group) => (
            <View key={group.dateKey}>
              <SectionLabel size="sm">{group.dateLabel}</SectionLabel>
              <Card>
                {group.items.map((slot, i) => (
                  <View
                    key={slot.id}
                    className={`flex-row items-center justify-between py-3 ${
                      i > 0 ? "border-t border-shell-border" : ""
                    }`}
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-base text-foreground">
                        {slot.timeLabel}
                      </Text>
                      {slot.status !== "open" ? (
                        <Text className="mt-0.5 text-xs text-shell-dim">
                          {slotStatusLabel(slot.status)}
                        </Text>
                      ) : null}
                    </View>
                    {slot.status === "open" ? (
                      <Pressable
                        onPress={() => confirmRemove(slot)}
                        hitSlop={8}
                        disabled={pendingId === slot.id}
                        className="active:opacity-70"
                      >
                        <Text
                          className={`text-label font-medium ${
                            pendingId === slot.id
                              ? "text-shell-mute"
                              : "text-danger-fg"
                          }`}
                        >
                          Remove
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
