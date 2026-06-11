import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { TextArea } from "@/components/TextArea";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import type {
  MobileFlashItemDetail,
  MobileMe,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { DangerButton } from "@/components/DangerButton";
import { TextField } from "@/components/TextField";
import { Segmented } from "@/components/Segmented";
import { ImageUploadField } from "@/components/ImageUploadField";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPut, apiPost } from "@/lib/api";
import { config } from "@/lib/config";
import {
  BOOKING_MODE_OPTIONS,
  ITEM_STATUS_OPTIONS,
  PRICE_TYPE_OPTIONS,
} from "@/lib/flash";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";

type ItemStatus = (typeof ITEM_STATUS_OPTIONS)[number]["value"];
type PriceType = (typeof PRICE_TYPE_OPTIONS)[number]["value"];
type BookingMode = (typeof BOOKING_MODE_OPTIONS)[number]["value"];

function Label({ children }: { children: string }) {
  return <Text className="mb-1.5 text-sm font-medium text-foreground">{children}</Text>;
}

export default function EditFlashItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApiQuery<MobileFlashItemDetail>(`/flash/items/${id}`);

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <ErrorState
              title="Couldn't load design"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <ItemForm id={id} initial={q.data} />;
}

function invalidateFlash(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      typeof query.queryKey[1] === "string" &&
      (query.queryKey[1] as string).startsWith("/flash"),
  });
}

function ItemForm({
  id,
  initial,
}: {
  id: string;
  initial: MobileFlashItemDetail;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useApiQuery<MobileMe>("/me");
  const [archiving, setArchiving] = useState(false);

  const publicUrl =
    initial.status === "published" && me.data?.slug
      ? `${config.publicUrl(me.data.slug)}/flash/${initial.slug}`
      : null;
  const hasRelatedBookings =
    initial.pendingCount + initial.confirmedCount > 0;

  function archive() {
    Alert.alert(
      "Archive design?",
      "It stops accepting bookings and leaves your public flash page. You can republish it later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: async () => {
            setArchiving(true);
            try {
              await apiPost(`/flash/items/${id}/archive`);
              await invalidateFlash(queryClient);
              router.back();
            } catch (e) {
              captureError(e, { op: "archiveFlashItem" });
              setArchiving(false);
              Alert.alert("Couldn't archive", "Try again in a moment.");
            }
          },
        },
      ],
    );
  }

  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<ItemStatus>(initial.status as ItemStatus);
  const [priceType, setPriceType] = useState<PriceType>(
    initial.priceType as PriceType,
  );
  const [price, setPrice] = useState(
    initial.price != null ? String(initial.price) : "",
  );
  const [bookingMode, setBookingMode] = useState<BookingMode>(
    initial.bookingMode as BookingMode,
  );
  const [maxBookings, setMaxBookings] = useState(
    initial.maxBookings != null ? String(initial.maxBookings) : "",
  );
  const [isBookable, setIsBookable] = useState(initial.isBookable);
  const [shortDescription, setShortDescription] = useState(
    initial.shortDescription ?? "",
  );
  const [sizeInfo, setSizeInfo] = useState(initial.sizeInfo ?? "");
  const [placementNotes, setPlacementNotes] = useState(
    initial.placementNotes ?? "",
  );
  const [availableFrom, setAvailableFrom] = useState(initial.availableFrom ?? "");
  const [availableUntil, setAvailableUntil] = useState(
    initial.availableUntil ?? "",
  );
  const [flashDayId, setFlashDayId] = useState(initial.flashDayId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayOptions = [
    { value: "", label: "None" },
    ...initial.flashDays.map((d) => ({ value: d.id, label: d.title })),
  ];

  async function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    Keyboard.dismiss();

    let priceValue: number | null = null;
    if (priceType !== "request" && price.trim() !== "") {
      // EU formatting: comma is the decimal separator, dots/spaces are grouping.
      let amt = price.trim().replace(/\s/g, "");
      if (amt.includes(",")) amt = amt.replace(/\./g, "").replace(",", ".");
      const n = Number(amt);
      if (!Number.isFinite(n) || n < 0) {
        setError("Price must be a positive number.");
        return;
      }
      priceValue = n;
    }

    let maxValue: number | null = null;
    if (bookingMode === "limited") {
      const m = parseInt(maxBookings.trim(), 10);
      if (!Number.isInteger(m) || m < 1) {
        setError("Max bookings must be at least 1 for limited mode.");
        return;
      }
      maxValue = m;
    }

    setSaving(true);
    setError(null);
    try {
      await apiPut(`/flash/items/${id}`, {
        title: title.trim(),
        status,
        priceType,
        price: priceValue,
        shortDescription: shortDescription.trim(),
        sizeInfo: sizeInfo.trim(),
        placementNotes: placementNotes.trim(),
        bookingMode,
        maxBookings: maxValue,
        isBookable,
        availableFrom: availableFrom.trim() || null,
        availableUntil: availableUntil.trim() || null,
        flashDayId: flashDayId || null,
      });
      // Reassigning a day changes the days-list counts + day detail too, so
      // invalidate every /flash view (list, detail, days).
      await invalidateFlash(queryClient);
      router.back();
    } catch (e) {
      captureError(e, { op: "saveFlashItem" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 /* tab bar clearance */ }}
      >
        {/* The design IS the product — the photo leads the screen (founder
            direction), everything else follows. */}
        <ImageUploadField
          label="Design image"
          hero
          imageUrl={initial.previewImageUrl}
          endpoint={`/flash/items/${id}/image`}
          onUploaded={() =>
            queryClient.invalidateQueries({
              predicate: (q) =>
                typeof q.queryKey[1] === "string" &&
                (q.queryKey[1] as string).startsWith("/flash"),
            })
          }
        />

        <View className="mb-4 rounded-2xl border border-shell-border bg-glass">
          <StatRow
            label="Availability"
            value={initial.availabilityLabel}
            tone={initial.bookable ? "text-success" : "text-shell-dim"}
          />
          <StatRow label="Pending" value={String(initial.pendingCount)} />
          <StatRow label="Confirmed" value={String(initial.confirmedCount)} />
          {initial.bookingMode === "limited" && initial.maxBookings ? (
            <StatRow
              label="Capacity"
              value={`${initial.confirmedCount} / ${initial.maxBookings}`}
            />
          ) : null}
        </View>

        {publicUrl ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void WebBrowser.openBrowserAsync(publicUrl);
            }}
            className="mb-3 items-center rounded-full border border-shell-border px-5 py-2.5 active:opacity-70"
          >
            <Text className="text-sm font-medium text-foreground">
              View public page
            </Text>
          </Pressable>
        ) : (
          <Text className="mb-3 text-center text-xs text-shell-mute">
            Publish this design to make it publicly visible.
          </Text>
        )}

        {hasRelatedBookings ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/bookings")}
            className="mb-4 items-center active:opacity-70"
          >
            <Text className="text-sm text-shell-dim">View related bookings</Text>
          </Pressable>
        ) : null}

        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
        />

        <Label>Status</Label>
        <Segmented
          options={ITEM_STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
        />

        <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass px-4 py-3">
          <Text className="text-base text-foreground">Bookable</Text>
          <Switch
            value={isBookable}
            onValueChange={setIsBookable}
            trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
            thumbColor={colors.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        </View>

        <Label>Price</Label>
        <Segmented
          options={PRICE_TYPE_OPTIONS}
          value={priceType}
          onChange={setPriceType}
        />
        {priceType !== "request" ? (
          <TextField
            label="Amount (EUR)"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="e.g. 120"
          />
        ) : null}

        <Label>Booking mode</Label>
        <Segmented
          options={BOOKING_MODE_OPTIONS}
          value={bookingMode}
          onChange={setBookingMode}
        />
        {bookingMode === "limited" ? (
          <TextField
            label="Max bookings"
            value={maxBookings}
            onChangeText={(v) => setMaxBookings(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            placeholder="e.g. 3"
          />
        ) : null}

        <Label>Short description</Label>
        <TextArea
          value={shortDescription}
          onChangeText={setShortDescription}
          maxLength={280}
          placeholder="A short line clients see"
          minHeight={56}
        />

        <TextField
          label="Size"
          value={sizeInfo}
          onChangeText={setSizeInfo}
          placeholder="e.g. ~10–15 cm"
        />
        <TextField
          label="Placement notes"
          value={placementNotes}
          onChangeText={setPlacementNotes}
          placeholder="e.g. forearm, calf"
        />

        <TextField
          label="Available from"
          value={availableFrom}
          onChangeText={setAvailableFrom}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <TextField
          label="Available until"
          value={availableUntil}
          onChangeText={setAvailableUntil}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />

        {initial.flashDays.length > 0 ? (
          <>
            <Label>Flash day</Label>
            <Segmented
              options={dayOptions}
              value={flashDayId}
              onChange={setFlashDayId}
            />
          </>
        ) : null}

        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
        ) : null}

        <Button
          label="Save"
          onPress={save}
          loading={saving}
          disabled={!title.trim()}
        />

        {initial.status !== "archived" ? (
          <DangerButton
            label="Archive design"
            onPress={archive}
            disabled={archiving || saving}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View className="flex-row items-center justify-between border-b border-shell-border px-4 py-3 last:border-b-0">
      <Text className="text-sm text-shell-dim">{label}</Text>
      <Text className={`text-sm font-medium ${tone ?? "text-foreground"}`}>
        {value}
      </Text>
    </View>
  );
}
