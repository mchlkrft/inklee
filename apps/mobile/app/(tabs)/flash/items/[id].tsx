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
import { ChevronDown, ChevronUp } from "lucide-react-native";
import * as WebBrowser from "expo-web-browser";
import type {
  MobileFlashFoldersResponse,
  MobileFlashItemDetail,
  MobileMe,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { DangerButton } from "@/components/DangerButton";
import { FieldLabel } from "@/components/FieldLabel";
import { TextField } from "@/components/TextField";
import { DateField } from "@/components/DateField";
import { Segmented } from "@/components/Segmented";
import { RadioList } from "@/components/RadioList";
import { ImageUploadField } from "@/components/ImageUploadField";
import { ErrorState } from "@/components/ErrorState";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/goods";
import { useApiQuery, apiPut, apiPost } from "@/lib/api";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { config } from "@/lib/config";
import {
  BOOKING_MODE_OPTIONS,
  ITEM_STATUS_OPTIONS,
  PRICE_TYPE_OPTIONS,
  invalidateFlash,
} from "@/lib/flash";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { colors } from "@/lib/tokens";

type ItemStatus = (typeof ITEM_STATUS_OPTIONS)[number]["value"];
type PriceType = (typeof PRICE_TYPE_OPTIONS)[number]["value"];
type BookingMode = (typeof BOOKING_MODE_OPTIONS)[number]["value"];

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({
  value: c,
  label: c.toUpperCase(),
}));

export default function EditFlashItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const themed = useColors();
  const q = useApiQuery<MobileFlashItemDetail>(`/flash/items/${id}`);

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
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

function ItemForm({
  id,
  initial,
}: {
  id: string;
  initial: MobileFlashItemDetail;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const themed = useColors();
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
              leave();
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
  const [slug, setSlug] = useState(initial.slug);
  // "Paste to replace" — empty means "no change" (so a file upload, which
  // refreshes initial.previewImageUrl, is never reverted by a stale paste value).
  const [imageUrlPaste, setImageUrlPaste] = useState("");
  const [instagramPostUrl, setInstagramPostUrl] = useState(
    initial.instagramPostUrl ?? "",
  );
  const [status, setStatus] = useState<ItemStatus>(initial.status as ItemStatus);
  const [priceType, setPriceType] = useState<PriceType>(
    initial.priceType as PriceType,
  );
  const [price, setPrice] = useState(
    initial.price != null ? String(initial.price) : "",
  );
  const [currency, setCurrency] = useState(initial.currency ?? DEFAULT_CURRENCY);
  const [currencyOpen, setCurrencyOpen] = useState(false);
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
  const [folderId, setFolderId] = useState(initial.folderId ?? "");
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    title !== initial.title ||
    slug !== initial.slug ||
    imageUrlPaste.trim() !== "" ||
    instagramPostUrl !== (initial.instagramPostUrl ?? "") ||
    status !== (initial.status as ItemStatus) ||
    priceType !== (initial.priceType as PriceType) ||
    price !== (initial.price != null ? String(initial.price) : "") ||
    currency !== (initial.currency ?? DEFAULT_CURRENCY) ||
    bookingMode !== (initial.bookingMode as BookingMode) ||
    maxBookings !==
      (initial.maxBookings != null ? String(initial.maxBookings) : "") ||
    isBookable !== initial.isBookable ||
    shortDescription !== (initial.shortDescription ?? "") ||
    sizeInfo !== (initial.sizeInfo ?? "") ||
    placementNotes !== (initial.placementNotes ?? "") ||
    availableFrom !== (initial.availableFrom ?? "") ||
    availableUntil !== (initial.availableUntil ?? "") ||
    folderId !== (initial.folderId ?? "");
  const { leave } = useUnsavedGuard(dirty && !saving && !archiving, save);

  // Folders organize the library; day membership lives in the day builder, not
  // here (a design can be in many days).
  const foldersQuery = useApiQuery<MobileFlashFoldersResponse>("/flash/folders");
  const folderOptions = [
    { value: "", label: "Unfiled" },
    ...(foldersQuery.data?.folders ?? []).map((f) => ({
      value: f.id,
      label: f.name,
    })),
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
      // Tri-state fields (slug / preview URL / Instagram URL) are sent ONLY when
      // changed, so a metadata save never clobbers a freshly uploaded image.
      const payload: Record<string, unknown> = {
        title: title.trim(),
        status,
        priceType,
        price: priceValue,
        currency,
        shortDescription: shortDescription.trim(),
        sizeInfo: sizeInfo.trim(),
        placementNotes: placementNotes.trim(),
        bookingMode,
        maxBookings: maxValue,
        isBookable,
        availableFrom: availableFrom.trim() || null,
        availableUntil: availableUntil.trim() || null,
        folderId: folderId || null,
      };
      if (slug.trim() !== initial.slug) payload.slug = slug.trim();
      if (imageUrlPaste.trim() !== "")
        payload.previewImageUrl = imageUrlPaste.trim();
      if (instagramPostUrl.trim() !== (initial.instagramPostUrl ?? ""))
        payload.instagramPostUrl = instagramPostUrl.trim();
      await apiPut(`/flash/items/${id}`, payload);
      // Folder/status changes affect the library list, so invalidate every
      // /flash view.
      await invalidateFlash(queryClient);
      leave();
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
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 /* no tab pill on detail forms */ }}
      >
        {/* The design IS the product — the photo leads the screen (founder
            direction), everything else follows. */}
        <ImageUploadField
          label="Design image"
          hero
          imageUrl={initial.previewImageUrl}
          endpoint={`/flash/items/${id}/image`}
          onUploaded={() => invalidateFlash(queryClient)}
        />

        <TextField
          label="Or paste an image URL"
          value={imageUrlPaste}
          onChangeText={setImageUrlPaste}
          keyboardType="url"
          autoCapitalize="none"
          placeholder="https://…"
        />

        <View className="mb-4 rounded-2xl border border-shell-border bg-glass">
          <StatRow
            label="Availability"
            value={initial.availabilityLabel}
            tone={initial.bookable ? "text-success-fg" : "text-shell-dim"}
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
          <View className="mb-3">
            <Button
              variant="secondary"
              size="sm"
              label="View public page"
              onPress={() => {
                void WebBrowser.openBrowserAsync(publicUrl);
              }}
            />
          </View>
        ) : (
          <Text className="mb-3 text-center text-xs text-shell-mute">
            Publish this design to make it publicly visible.
          </Text>
        )}

        {hasRelatedBookings ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/bookings")}
            className="mb-4 h-11 items-center justify-center active:opacity-70"
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

        <FieldLabel>Status</FieldLabel>
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

        <FieldLabel>Price</FieldLabel>
        <Segmented
          options={PRICE_TYPE_OPTIONS}
          value={priceType}
          onChange={setPriceType}
        />
        {priceType !== "request" ? (
          <>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label="Amount"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 120"
                />
              </View>
              <View className="w-28">
                <FieldLabel>Currency</FieldLabel>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Currency: ${currency.toUpperCase()}`}
                  accessibilityState={{ expanded: currencyOpen }}
                  onPress={() => setCurrencyOpen((v) => !v)}
                  className="h-12 flex-row items-center justify-between rounded-xl border border-shell-border px-4 active:opacity-80"
                >
                  <Text className="text-base text-foreground">
                    {currency.toUpperCase()}
                  </Text>
                  {currencyOpen ? (
                    <ChevronUp size={16} color={themed.shell.dim} />
                  ) : (
                    <ChevronDown size={16} color={themed.shell.dim} />
                  )}
                </Pressable>
              </View>
            </View>
            {currencyOpen ? (
              <View className="mt-2">
                <RadioList
                  options={CURRENCY_OPTIONS}
                  value={currency}
                  onChange={(v) => {
                    setCurrency(v);
                    setCurrencyOpen(false);
                  }}
                />
              </View>
            ) : null}
          </>
        ) : null}

        <FieldLabel>Booking mode</FieldLabel>
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

        {/* Secondary details collapsed by default to keep the form short.
            Values live in component state, so collapsing (unmounting) the inputs
            never drops what the artist typed. */}
        <Pressable
          onPress={() => setMoreOpen((v) => !v)}
          className="mb-3 mt-1 flex-row items-center justify-between rounded-xl border border-shell-border px-3 py-3 active:opacity-70"
        >
          <Text className="text-body font-medium text-foreground">
            More details
          </Text>
          {moreOpen ? (
            <ChevronUp size={18} color={themed.shell.dim} />
          ) : (
            <ChevronDown size={18} color={themed.shell.dim} />
          )}
        </Pressable>

        {moreOpen ? (
          <>
            <FieldLabel>Short description</FieldLabel>
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
              label="Public link"
              value={slug}
              onChangeText={setSlug}
              autoCapitalize="none"
              placeholder="e.g. rose-forearm"
            />
            <Text className="-mt-2 mb-3 text-xs text-shell-mute">
              The last part of the public URL for this design.
            </Text>

            <TextField
              label="Instagram post URL"
              value={instagramPostUrl}
              onChangeText={setInstagramPostUrl}
              keyboardType="url"
              autoCapitalize="none"
              placeholder="https://instagram.com/p/…"
            />
            {instagramPostUrl.trim() ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void WebBrowser.openBrowserAsync(instagramPostUrl.trim());
                }}
                className="-mt-2 mb-3 active:opacity-70"
              >
                <Text className="text-sm text-accent">View on Instagram</Text>
              </Pressable>
            ) : null}

            <DateField
              label="Available from"
              value={availableFrom || null}
              onChange={setAvailableFrom}
              onClear={() => setAvailableFrom("")}
            />
            <DateField
              label="Available until"
              value={availableUntil || null}
              onChange={setAvailableUntil}
              onClear={() => setAvailableUntil("")}
              minimumDate={
                availableFrom ? new Date(availableFrom) : undefined
              }
            />
          </>
        ) : null}

        {folderOptions.length > 1 ? (
          <>
            <FieldLabel>Folder</FieldLabel>
            <Segmented
              options={folderOptions}
              value={folderId}
              onChange={setFolderId}
            />
          </>
        ) : null}

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
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
