import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import type { PublicMapPin } from "@inklee/shared/map-directory";
import { MAP_LOCATION_CATEGORY_LABELS } from "@inklee/shared/map-directory";
import {
  STUDIO_SIGNAL_LABELS,
  isStudioSignalType,
} from "@inklee/shared/studio-signals";
import type { MobileMapLocationDetailResponse } from "@inklee/shared/mobile-api";
import { AdaptiveSheet } from "@/components/AdaptiveSheet";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";

// The native studio detail sheet: renders the SAME MapLocationDetail read-model
// the web detail panel fetches (one source, /api/mobile/map/locations/[id]).
// Actions: watch toggle (owned by the parent so the map's watch set stays in
// sync) + guest-spot request handoff.

// en-GB like every other date in the product (plan pages, web panel).
function fmtDateKey(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MapDetailSheet({
  visible,
  pin,
  watched,
  watchPending,
  watchError = null,
  onToggleWatch,
  onClose,
  onRequestGuestSpot,
}: {
  visible: boolean;
  pin: PublicMapPin;
  watched: boolean;
  watchPending: boolean;
  watchError?: string | null;
  onToggleWatch: () => void;
  onClose: () => void;
  onRequestGuestSpot: (studioName: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const q = useApiQuery<MobileMapLocationDetailResponse>(
    `/map/locations/${pin.id}`,
    { enabled: visible },
  );
  const detail = q.data?.detail ?? null;

  return (
    // panelClassName="": the sheet's header/ScrollView own the padding (same
    // convention as travel/map's sheet), no doubled insets.
    <AdaptiveSheet visible={visible} onClose={onClose} panelClassName="">
      <View className="flex-row items-start justify-between gap-2 px-4 pb-2 pt-4">
        <View className="min-w-0 flex-1">
          <Text
            className="text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {pin.name}
          </Text>
          <Text className="text-xs text-shell-mute">
            {MAP_LOCATION_CATEGORY_LABELS[pin.category]}
            {detail?.claimed ? " · claimed" : ""}
          </Text>
        </View>
        <Pressable hitSlop={8} onPress={onClose}>
          <X size={20} color={colors.bone} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 4,
          paddingBottom: insets.bottom + 12,
        }}
      >
        {q.loading && !detail ? (
          <Text className="text-sm text-shell-mute">Loading details…</Text>
        ) : !detail ? (
          <Text className="text-sm text-shell-mute">
            Could not load this place.
          </Text>
        ) : (
          <>
            {/* Banner copy verbatim from the web detail panel (one source). */}
            {detail.possiblyClosed ? (
              <View className="mb-3 rounded-xl border border-danger/40 bg-danger/10 p-3">
                <Text className="text-xs font-medium text-foreground">
                  Possibly closed
                </Text>
                <Text className="mt-0.5 text-xs text-shell-mute">
                  Someone reported this studio may have closed. Details may be
                  out of date.
                </Text>
              </View>
            ) : null}
            {detail.claimed && detail.lastConfirmedAt ? (
              <Text className="mb-3 text-xs text-shell-mute">
                {/* lastConfirmedAt is a full timestamp; slice to the date key
                    before formatting (matches the web panel). */}
                Confirmed by the studio on{" "}
                {fmtDateKey(detail.lastConfirmedAt.slice(0, 10))}.
              </Text>
            ) : null}
            {detail.unverified ? (
              <View className="mb-3 rounded-xl border border-shell-border p-3">
                <Text className="text-xs text-foreground">
                  Unverified listing. We compiled this from public map data, so
                  the details may be out of date.
                </Text>
              </View>
            ) : null}
            {detail.signal && isStudioSignalType(detail.signal) ? (
              <View className="mb-3 rounded-xl border border-rosa/40 bg-rosa/10 p-3">
                <Text className="text-xs font-medium text-foreground">
                  Right now: {STUDIO_SIGNAL_LABELS[detail.signal]}
                </Text>
              </View>
            ) : null}

            {[detail.address, detail.city, detail.country].filter(Boolean)
              .length > 0 ? (
              <View className="mb-3">
                <Text className="mb-1 text-xs uppercase tracking-wider text-shell-mute">
                  Where
                </Text>
                <Text className="text-sm text-foreground">
                  {[detail.address, detail.city, detail.country]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
            ) : null}

            {detail.openingHours ? (
              <View className="mb-3">
                <Text className="mb-1 text-xs uppercase tracking-wider text-shell-mute">
                  Opening hours
                </Text>
                <Text className="text-sm text-foreground">
                  {detail.openingHours}
                </Text>
              </View>
            ) : null}

            <View className="mb-3 flex-row flex-wrap gap-2">
              {detail.website ? (
                <ActionChip
                  label="Website"
                  onPress={() => Linking.openURL(detail.website!)}
                />
              ) : null}
              {detail.instagram ? (
                <ActionChip
                  label={`@${detail.instagram.replace(/^@/, "")}`}
                  onPress={() =>
                    Linking.openURL(
                      `https://instagram.com/${detail.instagram!.replace(/^@/, "")}`,
                    )
                  }
                />
              ) : null}
              {detail.phone ? (
                <ActionChip
                  label="Call"
                  onPress={() =>
                    Linking.openURL(
                      `tel:${detail.phone!.replace(/[^\d+]/g, "")}`,
                    )
                  }
                />
              ) : null}
              <ActionChip
                label={watched ? "Watching ✓" : "Watch"}
                disabled={watchPending}
                onPress={onToggleWatch}
              />
            </View>
            {watchError ? (
              <Text className="mb-3 text-xs text-danger-fg">{watchError}</Text>
            ) : null}

            {detail.styles && !detail.styles.isEmpty ? (
              <View className="mb-3">
                <Text className="mb-1 text-xs uppercase tracking-wider text-shell-mute">
                  Styles represented
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {detail.styles.specialties.map((s) => (
                    <Text
                      key={s.key}
                      className="rounded-full border border-shell-border px-2.5 py-1 text-xs text-foreground"
                    >
                      {s.label}
                    </Text>
                  ))}
                  {detail.styles.guestStyles.map((s) => (
                    <Text
                      key={`g-${s.key}`}
                      className="rounded-full bg-rosa/15 px-2.5 py-1 text-xs text-foreground"
                    >
                      {s.label}
                      {s.showCount ? ` · ${s.count} visiting` : " · guest"}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {detail.timeline &&
            (detail.timeline.current.length > 0 ||
              detail.timeline.upcoming.length > 0 ||
              detail.timeline.past.length > 0) ? (
              <View className="mb-3">
                <Text className="mb-1 text-xs uppercase tracking-wider text-shell-mute">
                  Guest artists
                </Text>
                {(
                  [
                    ["Now", detail.timeline.current],
                    ["Coming up", detail.timeline.upcoming],
                    ["Past", detail.timeline.past],
                  ] as const
                ).map(([label, entries]) =>
                  entries.length > 0 ? (
                    <View key={label} className="mb-1.5">
                      <Text className="text-xs font-medium text-foreground">
                        {label}
                      </Text>
                      {entries.map((e, i) => (
                        <Text
                          key={`${label}-${i}`}
                          className="text-xs text-shell-mute"
                        >
                          {e.name ?? "A guest artist"} ·{" "}
                          {fmtDateKey(e.startsOn)} to {fmtDateKey(e.endsOn)}
                        </Text>
                      ))}
                    </View>
                  ) : null,
                )}
              </View>
            ) : null}

            {detail.houseRules.length > 0 ? (
              <View className="mb-3">
                <Text className="mb-1 text-xs uppercase tracking-wider text-shell-mute">
                  House rules
                </Text>
                {detail.houseRules.map((r) => (
                  <Text key={r.key} className="text-xs text-shell-mute">
                    {r.content}
                  </Text>
                ))}
              </View>
            ) : null}

            {detail.requestable && !detail.ownStudio ? (
              <Pressable
                onPress={() => onRequestGuestSpot(detail.name)}
                className="mt-1 items-center rounded-full bg-mustard py-3 active:opacity-80"
              >
                <Text className="text-sm font-semibold text-charcoal">
                  Request a guest spot
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </AdaptiveSheet>
  );
}

function ActionChip({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`rounded-full border border-shell-border px-3 py-2.5 active:opacity-70 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <Text className="text-xs text-foreground">{label}</Text>
    </Pressable>
  );
}
