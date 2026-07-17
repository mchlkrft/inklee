import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { TextArea } from "@/components/TextArea";
import { Button } from "@/components/Button";
import { apiPut, invalidateBookingViews, useApiQuery } from "@/lib/api";
import { useBookingsHeaderInset } from "@/lib/bookings-header";
import type { ClientDetail, ClientHistoryItem } from "@/lib/clients";
import { clearDraft, getDraft, hasDraft, setDraft } from "@/lib/draft-store";
import { formatShortDate, relativeTime } from "@/lib/date";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useTimedFlag } from "@/lib/use-timed-flag";

// The client-profile CONTENT, extracted from app/clients/[email].tsx (ME-15)
// so it renders both as the pushed route (compact/medium) and inside the
// Clients list's detail pane at the expanded window class. Pure function of
// `email` with its own fetch (shared TanStack cache entry across both hosts).
//
// Unsaved notes ride the draft store keyed per client: a layout-class flip
// remounts this component (pane <-> route, or a pane selection swap away and
// back), and the draft wins over the server value on rehydrate. Cleared on
// successful save.
export function ClientDetailContent({ email }: { email: string }) {
  const themed = useColors();
  const queryClient = useQueryClient();
  // 0 when pushed as a route; the pinned band's height inside the pane.
  const headerInset = useBookingsHeaderInset();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<ClientDetail>(`/clients/${encodeURIComponent(email)}`);

  const draftKey = `client-notes:${email}`;
  const [notes, setNotesState] = useState<string>(
    () => getDraft<string>(draftKey) ?? "",
  );
  // A live draft means the field is already the source of truth — skip the
  // one-shot server seed entirely (the draft may legitimately be "").
  const [notesReady, setNotesReady] = useState(() => hasDraft(draftKey));
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, markNotesSaved] = useTimedFlag();
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !notesReady) {
      setNotesState(data.notes ?? "");
      setNotesReady(true);
    }
  }, [data, notesReady]);

  function onChangeNotes(value: string) {
    setDraft(draftKey, value);
    setNotesState(value);
  }

  async function saveNotes() {
    setSavingNotes(true);
    setNotesError(null);
    try {
      await apiPut(`/clients/${encodeURIComponent(email)}`, { notes });
      await invalidateBookingViews(queryClient);
      clearDraft(draftKey);
      markNotesSaved();
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
          <ActivityIndicator color={themed.accent} />
        ) : (
          <View className="items-center">
            <EmptyState
              title="Couldn't load client"
              subtitle={error ?? undefined}
            />
            <View className="mt-2">
              <Button
                label="Try again"
                variant="secondary"
                size="sm"
                onPress={refresh}
              />
            </View>
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
      contentContainerStyle={{
        padding: 20,
        paddingTop: 20 + headerInset,
        paddingBottom: 48,
      }}
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
          tintColor={themed.accent}
        />
      }
    >
      {/* Profile header: avatar + name at display size + readable contact line
          + stat chips (founder: main information must be readable at a glance). */}
      <View className="flex-row items-center gap-4">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-mustard/20">
          <Text className="text-2xl font-bold text-accent">
            {data.client.replace(/^@/, "").charAt(0).toUpperCase() || "·"}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-display font-bold text-foreground" numberOfLines={1}>
            {data.client}
          </Text>
          {showEmail ? (
            <Text className="mt-0.5 text-base text-shell-dim" numberOfLines={1}>
              {data.email}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="mt-4 flex-row gap-2">
        <View className="rounded-full bg-glass px-3 py-1.5">
          <Text className="text-base font-semibold text-foreground">
            {data.bookingCount} booking{data.bookingCount === 1 ? "" : "s"}
          </Text>
        </View>
        <View className="rounded-full bg-success/15 px-3 py-1.5">
          <Text className="text-base font-semibold text-success-fg">
            {approved} approved
          </Text>
        </View>
      </View>

      <View className="mt-6">
        <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-shell-mute">
          Notes (private)
        </Text>
        <TextArea
          value={notes}
          onChangeText={onChangeNotes}
          placeholder="Private notes about this client (only you can see these)."
          minHeight={88}
        />
        {notesError ? (
          <Text className="mb-2 text-sm text-danger-fg">{notesError}</Text>
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
            <Text className="text-sm text-success-fg">Saved.</Text>
          ) : null}
        </View>
      </View>

      <View className="mt-6">
        <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-shell-mute">
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
      {/* Founder round 5: history "table" one notch up — 20/16/16. */}
      <View className="mb-1 flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-title font-semibold text-foreground">
          {item.placement ?? "Tattoo request"}
        </Text>
        <StatusPill status={item.status} />
      </View>
      {item.size ? (
        <Text className="text-body text-shell-dim">{item.size}</Text>
      ) : null}
      <Text className="mt-1 text-base text-shell-dim">
        {dateLabel} · submitted {relativeTime(item.createdAt)}
      </Text>
    </Card>
  );
}
