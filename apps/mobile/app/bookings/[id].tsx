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
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { ActivityTimeline } from "@/components/booking/ActivityTimeline";
import { BookingActions } from "@/components/booking/BookingActions";
import { ReferenceImageGallery } from "@/components/booking/ReferenceImageGallery";
import { useApiQuery } from "@/lib/api";
import { formatMoney, type BookingDetail } from "@/lib/bookings";
import { useColors } from "@/lib/theme";
import { formatShortDate, relativeTime } from "@/lib/date";

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const themed = useColors();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<BookingDetail>(`/bookings/${id}`);

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-5">
        {loading ? (
          <ActivityIndicator color={themed.accent} />
        ) : (
          <View className="items-center">
            <EmptyState
              title="Couldn't load request"
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

  const b = data;
  const d = b.deposit;

  return (
    <ScrollView
      className="flex-1 bg-background"
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
          tintColor={themed.accent}
        />
      }
    >
      <View className="mb-1 flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-2xl font-bold text-foreground">{b.client}</Text>
        <StatusPill status={b.status} />
      </View>
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-sm text-shell-dim">
          Requested {relativeTime(b.createdAt)}
        </Text>
        {b.status === "approved" ? (
          <Pressable
            onPress={() => router.push(`/bookings/new?id=${b.id}`)}
            hitSlop={8}
            className="active:opacity-70"
          >
            <Text className="text-sm font-medium text-accent">
              Edit details
            </Text>
          </Pressable>
        ) : null}
      </View>

      {b.handle || b.email ? (
        <Section title="Client">
          {b.handle ? <Field label="Instagram" value={`@${b.handle}`} /> : null}
          {b.email ? <Field label="Email" value={b.email} /> : null}
        </Section>
      ) : null}

      <Section title="Tattoo">
        <Field label="Placement" value={b.placement} />
        <Field label="Size" value={b.size} />
        <Field label="Description" value={b.description} />
      </Section>

      {(b.referenceLink || b.referenceImagePaths.length > 0) && (
        <Section title="Reference">
          {b.referenceLink ? (
            // The link is client-supplied via the public booking form. Only open
            // http(s) URLs — zod's .url() accepts arbitrary schemes (tel:, sms:,
            // app deep links), so opening verbatim would be a scheme-abuse sink.
            // Non-http links render as copy-only text, never tappable.
            /^https?:\/\//i.test(b.referenceLink) ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => Linking.openURL(b.referenceLink!)}
              >
                <Text className="text-sm uppercase tracking-wide text-shell-mute">
                  Link
                </Text>
                <Text className="mt-0.5 text-base text-accent" numberOfLines={1}>
                  {b.referenceLink}
                </Text>
              </Pressable>
            ) : (
              <>
                <Text className="text-sm uppercase tracking-wide text-shell-mute">
                  Link
                </Text>
                <Text
                  className="mt-0.5 text-base text-shell-dim"
                  numberOfLines={1}
                  selectable
                >
                  {b.referenceLink}
                </Text>
              </>
            )
          ) : null}
          {(b.referenceImages ?? []).length > 0 ? (
            <View className={b.referenceLink ? "mt-2" : undefined}>
              <ReferenceImageGallery images={b.referenceImages ?? []} />
            </View>
          ) : b.referenceImagePaths.length > 0 ? (
            // Images exist but didn't sign (storage hiccup) or the API
            // predates signed URLs: keep the count visible, never imply the
            // client attached nothing.
            <Text className="mt-2 text-sm text-shell-dim">
              {b.referenceImagePaths.length} reference image
              {b.referenceImagePaths.length === 1 ? "" : "s"} attached. Pull to
              refresh to load previews.
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
          {d.refunded && d.refundedAt ? (
            <Field label="Refunded on" value={formatShortDate(d.refundedAt)} />
          ) : null}
          {d.dueAt ? (
            <Field label="Due by" value={formatShortDate(d.dueAt)} />
          ) : null}
          {d.note ? <Field label="Note" value={d.note} /> : null}
        </Section>
      ) : null}

      {/* booking_created guarantees at least one visible event for any real
          booking; an empty array only means an older API — hide the section. */}
      {(b.timeline ?? []).length > 0 ? (
        <Section title="Activity">
          <ActivityTimeline events={b.timeline ?? []} />
        </Section>
      ) : null}

      <View className="mt-2">
        <BookingActions booking={b} />
      </View>
    </ScrollView>
  );
}

// Founder ME-5: field rows on the round-5 readability standard (14px labels /
// 16px values), matching the client detail one tap away.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-shell-mute">
        {title}
      </Text>
      <View className="gap-2.5">{children}</View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View>
      <Text className="text-sm text-shell-mute">{label}</Text>
      <Text className="mt-0.5 text-base text-foreground">
        {value && value.trim() ? value : "-"}
      </Text>
    </View>
  );
}
