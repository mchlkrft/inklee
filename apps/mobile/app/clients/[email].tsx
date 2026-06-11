import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { TextArea } from "@/components/TextArea";
import { Button } from "@/components/Button";
import { apiPut, invalidateBookingViews, useApiQuery } from "@/lib/api";
import type { ClientDetail, ClientHistoryItem } from "@/lib/clients";
import { formatShortDate, relativeTime } from "@/lib/date";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";

export default function ClientDetailScreen() {
  // Expo Router decodes the path segment, so `email` is the raw address; we
  // re-encode it for the API path (the server decodes once).
  const { email: param } = useLocalSearchParams<{ email: string }>();
  const email = param ?? "";
  const queryClient = useQueryClient();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<ClientDetail>(`/clients/${encodeURIComponent(email)}`);

  const [notes, setNotes] = useState("");
  const [notesReady, setNotesReady] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !notesReady) {
      setNotes(data.notes ?? "");
      setNotesReady(true);
    }
  }, [data, notesReady]);

  async function saveNotes() {
    setSavingNotes(true);
    setNotesError(null);
    try {
      await apiPut(`/clients/${encodeURIComponent(email)}`, { notes });
      await invalidateBookingViews(queryClient);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (e) {
      captureError(e, { op: "saveClientNotes" });
      setNotesError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSavingNotes(false);
    }
  }

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-5">
        {loading ? (
          <ActivityIndicator color={colors.mustard} />
        ) : (
          <View className="items-center">
            <EmptyState
              title="Couldn't load client"
              subtitle={error ?? undefined}
            />
            <Pressable
              accessibilityRole="button"
              onPress={refresh}
              className="mt-2 h-11 items-center justify-center rounded-xl border border-shell-border px-5 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-foreground">Try again</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  const approved = data.history.filter((h) => h.status === "approved").length;
  // Avoid repeating the email when it's already the display label.
  const showEmail = data.client !== data.email;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      // The notes editor sits in this scroll: let the Save tap land on the
      // first press with the keyboard open, and keep the field above it.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.mustard}
        />
      }
    >
      <Text className="text-2xl font-bold text-foreground">{data.client}</Text>
      {showEmail ? (
        <Text className="mt-0.5 text-sm text-shell-dim">{data.email}</Text>
      ) : null}
      <Text className="mt-1 text-xs text-shell-mute">
        {data.bookingCount} booking{data.bookingCount === 1 ? "" : "s"} ·{" "}
        {approved} approved
      </Text>

      <View className="mt-6">
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-shell-mute">
          Notes (private)
        </Text>
        <TextArea
          value={notes}
          onChangeText={(t) => {
            setNotes(t);
            setNotesSaved(false);
          }}
          placeholder="Private notes about this client (only you can see these)."
          minHeight={88}
        />
        {notesError ? (
          <Text className="mb-2 text-xs text-danger">{notesError}</Text>
        ) : null}
        <View className="flex-row items-center gap-3">
          <View className="w-32">
            <Button
              label="Save notes"
              variant="secondary"
              size="sm"
              onPress={saveNotes}
              loading={savingNotes}
            />
          </View>
          {notesSaved ? (
            <Text className="text-xs text-success">Saved.</Text>
          ) : null}
        </View>
      </View>

      <View className="mt-6">
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-shell-mute">
          Booking history
        </Text>
        <View className="gap-2">
          {data.history.map((h) => (
            <HistoryRow key={h.id} item={h} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function HistoryRow({ item }: { item: ClientHistoryItem }) {
  const router = useRouter();
  const dateLabel = item.preferredDate
    ? formatShortDate(item.preferredDate)
    : "No date";

  return (
    <Card onPress={() => router.push(`/bookings/${item.id}`)}>
      <View className="mb-1 flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-base font-semibold text-foreground">
          {item.placement ?? "Tattoo request"}
        </Text>
        <StatusPill status={item.status} />
      </View>
      {item.size ? (
        <Text className="text-sm text-shell-dim">{item.size}</Text>
      ) : null}
      <Text className="mt-0.5 text-xs text-shell-mute">
        {dateLabel} · submitted {relativeTime(item.createdAt)}
      </Text>
    </Card>
  );
}
