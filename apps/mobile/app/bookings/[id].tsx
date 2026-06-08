import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { BookingActions } from "@/components/booking/BookingActions";
import { useApiQuery } from "@/lib/api";
import { formatMoney, type BookingDetail } from "@/lib/bookings";
import { colors } from "@/lib/tokens";
import { formatShortDate, relativeTime } from "@/lib/date";

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<BookingDetail>(`/bookings/${id}`);

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-charcoal px-5">
        {loading ? (
          <ActivityIndicator color={colors.mustard} />
        ) : (
          <View className="items-center">
            <EmptyState
              title="Couldn't load request"
              subtitle={error ?? undefined}
            />
            <Pressable
              accessibilityRole="button"
              onPress={refresh}
              className="mt-2 h-11 items-center justify-center rounded-xl border border-shell-border px-5 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-bone">Try again</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  const b = data;
  const d = b.deposit;

  return (
    <ScrollView
      className="flex-1 bg-charcoal"
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
      // Deposit-form inputs sit low in this scroll view; let taps on the
      // submit/cancel buttons land on the first tap while the keyboard is open,
      // and dismiss the keyboard on scroll.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.mustard}
        />
      }
    >
      <View className="mb-1 flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-2xl font-bold text-bone">{b.client}</Text>
        <StatusPill status={b.status} />
      </View>
      <Text className="mb-6 text-xs text-shell-dim">
        Requested {relativeTime(b.createdAt)}
      </Text>

      <Section title="Tattoo">
        <Field label="Placement" value={b.placement} />
        <Field label="Size" value={b.size} />
        <Field label="Description" value={b.description} />
      </Section>

      {(b.referenceLink || b.referenceImagePaths.length > 0) && (
        <Section title="Reference">
          {b.referenceLink ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(b.referenceLink!)}
            >
              <Text className="text-xs uppercase tracking-wide text-shell-mute">
                Link
              </Text>
              <Text className="mt-0.5 text-sm text-mustard" numberOfLines={1}>
                {b.referenceLink}
              </Text>
            </Pressable>
          ) : null}
          {b.referenceImagePaths.length > 0 ? (
            <Text className="mt-2 text-sm text-shell-dim">
              {b.referenceImagePaths.length} reference image
              {b.referenceImagePaths.length === 1 ? "" : "s"} attached — viewable
              on the web dashboard.
            </Text>
          ) : null}
        </Section>
      )}

      <Section title="Schedule">
        <Field
          label="Preferred date"
          value={b.preferredDate ? formatShortDate(b.preferredDate) : null}
        />
      </Section>

      {d ? (
        <Section title="Deposit">
          <Field label="Amount" value={formatMoney(d.amount, d.currency)} />
          <Field
            label="Status"
            value={
              d.refunded
                ? "Refunded"
                : d.paid
                  ? "Paid"
                  : d.hasCardIntent
                    ? "Awaiting card payment"
                    : "Awaiting payment"
            }
          />
          {d.dueAt ? (
            <Field label="Due by" value={formatShortDate(d.dueAt)} />
          ) : null}
          {d.note ? <Field label="Note" value={d.note} /> : null}
        </Section>
      ) : null}

      <View className="mt-2">
        <BookingActions booking={b} />
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-shell-mute">
        {title}
      </Text>
      <View className="gap-2.5">{children}</View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View>
      <Text className="text-xs text-shell-mute">{label}</Text>
      <Text className="mt-0.5 text-sm text-bone">
        {value && value.trim() ? value : "—"}
      </Text>
    </View>
  );
}
