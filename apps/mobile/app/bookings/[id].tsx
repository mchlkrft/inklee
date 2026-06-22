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
import {
  Activity,
  AtSign,
  Banknote,
  Calendar,
  CalendarClock,
  Clock,
  FileText,
  Images,
  Link as LinkIcon,
  Mail,
  MapPin,
  PenTool,
  Ruler,
  StickyNote,
  User,
  Wallet,
} from "lucide-react-native";
import { StatusPill } from "@/components/StatusPill";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CardHeader } from "@/components/CardHeader";
import { ActivityTimeline } from "@/components/booking/ActivityTimeline";
import { BookingActions } from "@/components/booking/BookingActions";
import { ReferenceImageGallery } from "@/components/booking/ReferenceImageGallery";
import type { LucideIcon } from "@/lib/icon-types";
import { useApiQuery } from "@/lib/api";
import { formatMoney, type BookingDetail } from "@/lib/bookings";
import { useColors } from "@/lib/theme";
import { formatShortDate, relativeTime } from "@/lib/date";

// Round-12 detail rebuild (client feedback: the flat label/value list read small
// and empty). The submitted form info now lives in bordered cards with icon
// headers and an aligned label/value table (InfoRow); a stat strip up top gives
// the at-a-glance overview (when + deposit), and Instagram / email are tappable.
export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useColors();
  const { data, loading, error, refreshing, refresh } =
    useApiQuery<BookingDetail>(`/bookings/${id}`);

  if (!data) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-5">
        {loading ? (
          <ActivityIndicator color={c.accent} />
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
  const initial = (b.client?.trim()?.[0] ?? "?").toUpperCase();
  const depositState = d
    ? d.refunded
      ? "Refunded"
      : d.paid
        ? "Paid"
        : d.hasCardIntent
          ? "Awaiting card payment"
          : "Awaiting payment"
    : null;
  const hasReference =
    !!b.referenceLink || b.referenceImagePaths.length > 0;

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
          tintColor={c.accent}
        />
      }
    >
      <View className="gap-4">
        {/* Identity header */}
        <View className="flex-row items-start gap-3">
          <View className="h-14 w-14 items-center justify-center rounded-full border-brand border-shell-border bg-card">
            <Text className="text-2xl font-bold text-foreground">{initial}</Text>
          </View>
          <View className="flex-1">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 text-2xl font-bold text-foreground">
                {b.client}
              </Text>
              <StatusPill status={b.status} />
            </View>
            <View className="mt-1 flex-row items-center justify-between">
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
          </View>
        </View>

        {/* Quick overview */}
        <View className="flex-row gap-3">
          <StatTile
            icon={Calendar}
            label="Preferred date"
            value={b.preferredDate ? formatShortDate(b.preferredDate) : "Flexible"}
            sub={b.preferredDate ? "Requested by client" : "No date given"}
          />
          <StatTile
            icon={Wallet}
            label="Deposit"
            value={d ? formatMoney(d.amount, d.currency) : "Not set"}
            sub={depositState ?? "Not requested"}
          />
        </View>

        {/* Client / contact */}
        {b.handle || b.email ? (
          <Card>
            <CardHeader icon={User} tint="rosa" title="Client" />
            <View className="mt-4">
              {b.handle ? (
                <InfoRow
                  first
                  icon={AtSign}
                  label="Instagram"
                  value={`@${b.handle}`}
                  accent
                  onPress={() =>
                    Linking.openURL(`https://instagram.com/${b.handle}`)
                  }
                />
              ) : null}
              {b.email ? (
                <InfoRow
                  first={!b.handle}
                  icon={Mail}
                  label="Email"
                  value={b.email}
                  accent
                  onPress={() => Linking.openURL(`mailto:${b.email}`)}
                />
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* Tattoo */}
        <Card>
          <CardHeader icon={PenTool} tint="mustard" title="Tattoo" />
          <View className="mt-4">
            <InfoRow first icon={MapPin} label="Placement" value={b.placement} />
            <InfoRow icon={Ruler} label="Size" value={b.size} />
            {b.description ? (
              <View
                className="pt-3"
                style={{ borderTopWidth: 1, borderColor: c.shell.border }}
              >
                <View className="mb-1.5 flex-row items-center gap-2">
                  <FileText size={16} color={c.shell.mute} />
                  <Text className="text-sm text-shell-dim">Description</Text>
                </View>
                <Text className="text-base leading-6 text-foreground">
                  {b.description}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>

        {/* Additional details — the artist's custom booking-form questions and
            the client's answers (pre-formatted server-side). */}
        {(b.customAnswers ?? []).length > 0 ? (
          <Card>
            <CardHeader
              icon={FileText}
              tint="bone"
              title="Additional details"
            />
            <View className="mt-4">
              {(b.customAnswers ?? []).map((ans, i) => (
                <InfoRow
                  key={`${ans.label}-${i}`}
                  first={i === 0}
                  label={ans.label}
                  value={ans.value}
                />
              ))}
            </View>
          </Card>
        ) : null}

        {/* Reference */}
        {hasReference ? (
          <Card>
            <CardHeader icon={Images} tint="cobalt" title="Reference" />
            <View className="mt-4 gap-3">
              {b.referenceLink ? (
                // The link is client-supplied via the public booking form. Only
                // open http(s) URLs — zod's .url() accepts arbitrary schemes
                // (tel:, sms:, app deep links), so opening verbatim would be a
                // scheme-abuse sink. Non-http links render as copy-only text.
                /^https?:\/\//i.test(b.referenceLink) ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => Linking.openURL(b.referenceLink!)}
                    className="flex-row items-center gap-2 active:opacity-70"
                  >
                    <LinkIcon size={16} color={c.shell.mute} />
                    <Text
                      className="flex-1 text-base text-accent"
                      numberOfLines={1}
                    >
                      {b.referenceLink}
                    </Text>
                  </Pressable>
                ) : (
                  <View className="flex-row items-center gap-2">
                    <LinkIcon size={16} color={c.shell.mute} />
                    <Text
                      className="flex-1 text-base text-shell-dim"
                      numberOfLines={1}
                      selectable
                    >
                      {b.referenceLink}
                    </Text>
                  </View>
                )
              ) : null}
              {(b.referenceImages ?? []).length > 0 ? (
                <ReferenceImageGallery images={b.referenceImages ?? []} />
              ) : b.referenceImagePaths.length > 0 ? (
                // Images exist but didn't sign (storage hiccup) or the API
                // predates signed URLs: keep the count visible, never imply the
                // client attached nothing.
                <Text className="text-sm text-shell-dim">
                  {b.referenceImagePaths.length} reference image
                  {b.referenceImagePaths.length === 1 ? "" : "s"} attached. Pull
                  to refresh to load previews.
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* Deposit */}
        {d ? (
          <Card>
            <CardHeader icon={Wallet} tint="green" title="Deposit" />
            <View className="mt-4">
              <InfoRow
                first
                icon={Banknote}
                label="Amount"
                value={formatMoney(d.amount, d.currency)}
              />
              <InfoRow icon={Clock} label="Status" value={depositState} />
              {d.refunded && d.refundedAt ? (
                <InfoRow
                  icon={CalendarClock}
                  label="Refunded on"
                  value={formatShortDate(d.refundedAt)}
                />
              ) : null}
              {d.dueAt && !d.paid && !d.refunded ? (
                <InfoRow
                  icon={CalendarClock}
                  label="Due by"
                  value={formatShortDate(d.dueAt)}
                />
              ) : null}
              {d.note ? (
                <InfoRow icon={StickyNote} label="Note" value={d.note} />
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* Activity */}
        {/* booking_created guarantees at least one visible event for any real
            booking; an empty array only means an older API — hide the section. */}
        {(b.timeline ?? []).length > 0 ? (
          <Card>
            <CardHeader icon={Activity} tint="bone" title="Activity" />
            <View className="mt-4">
              <ActivityTimeline events={b.timeline ?? []} />
            </View>
          </Card>
        ) : null}

        <BookingActions booking={b} />
      </View>
    </ScrollView>
  );
}

// One at-a-glance stat (when / deposit). Icon badge + overline label + a bold
// value, so the two facts that drive the artist's next move read first.
function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  const c = useColors();
  return (
    <View className="flex-1 rounded-card border-brand border-shell-border bg-card p-4">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-shell-hover">
        <Icon size={18} color={c.accent} />
      </View>
      <Text
        className="mt-3 text-overline uppercase text-shell-mute"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text className="mt-1 text-lg font-semibold text-foreground" numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text className="mt-0.5 text-caption text-shell-dim" numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

// One table row: an aligned icon + label column on the left, the value on the
// right (wraps freely). Tappable when onPress is given (Instagram / email).
// `first` drops the top divider so the rules sit only BETWEEN rows.
function InfoRow({
  icon: Icon,
  label,
  value,
  onPress,
  accent,
  first,
}: {
  icon?: LucideIcon;
  label: string;
  value: string | null;
  onPress?: () => void;
  accent?: boolean;
  first?: boolean;
}) {
  const c = useColors();
  const display = value && value.trim() ? value : "Not provided";
  const inner = (
    <View
      className="flex-row items-start gap-3 py-3"
      style={first ? undefined : { borderTopWidth: 1, borderColor: c.shell.border }}
    >
      <View className="w-28 flex-row items-center gap-2">
        {Icon ? <Icon size={16} color={c.shell.mute} /> : null}
        <Text className="flex-1 text-sm text-shell-dim">{label}</Text>
      </View>
      <Text
        className={`flex-1 text-base ${accent ? "text-accent" : "text-foreground"}`}
      >
        {display}
      </Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-70">
        {inner}
      </Pressable>
    );
  }
  return inner;
}
