import { Modal, Pressable, ScrollView, Share, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ExternalLink, Pencil, Share2, X } from "lucide-react-native";
import type { MobileFlashItem } from "@inklee/shared/mobile-api";
import { Button } from "@/components/Button";
import { config } from "@/lib/config";
import { flashLabel, flashStatusTone, formatFlashPrice } from "@/lib/flash";
import { captureError } from "@/lib/telemetry";
import { themeVars, useColors, useThemePreference } from "@/lib/theme";

// Tapping a flash design in the library opens THIS detail modal (not straight
// to the editor): a big picture + the item's key facts, with Edit / Share as the
// quick main actions and a quiet "View public page".
//
// Theme-aware: a RN Modal portals OUTSIDE the ThemeProvider wrapper, so the
// className `var(--…)` tokens fall back to the dark :root unless themeVars[scheme]
// is re-applied on the modal root — the same fix the travel-map Trips modal uses.
export function FlashItemSheet({
  item,
  artistSlug,
  onClose,
  onEdit,
}: {
  item: MobileFlashItem | null;
  artistSlug: string | null;
  onClose: () => void;
  onEdit: (id: string) => void;
}) {
  const colors = useColors();
  const { scheme } = useThemePreference();
  const insets = useSafeAreaInsets();

  // A live public page only exists for a PUBLISHED item (mirrors the editor's
  // gate). Drafts / archived designs have no shareable URL, so Share + View are
  // disabled for them.
  const publicUrl =
    item && item.status === "published" && artistSlug
      ? `${config.publicUrl(artistSlug)}/flash/${item.slug}`
      : null;

  async function share() {
    if (!publicUrl || !item) return;
    try {
      await Share.share({
        message: `${item.title}\n${publicUrl}`,
        url: publicUrl,
      });
    } catch (e) {
      captureError(e, { op: "shareFlashItem" });
    }
  }

  return (
    <Modal
      visible={item !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Re-apply theme vars: the Modal portals outside the ThemeProvider, so
          without this the className tokens fall back to the dark :root. */}
      <View style={[themeVars[scheme], { flex: 1 }]} className="justify-end">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        />
        {item ? (
          <View
            className="rounded-t-3xl border-t border-shell-border bg-background"
            style={{ maxHeight: "90%", paddingBottom: insets.bottom + 16 }}
          >
            <View className="flex-row items-center justify-between px-5 pb-1 pt-4">
              <Text className="text-sm font-medium uppercase tracking-wider text-shell-mute">
                Design
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center active:opacity-70"
              >
                <X size={20} color={colors.bone} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Big picture */}
              {item.previewImageUrl ? (
                <Image
                  source={{ uri: item.previewImageUrl }}
                  style={{ width: "100%", height: 300, borderRadius: 20 }}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View className="h-72 w-full items-center justify-center rounded-[20px] bg-mustard/15">
                  <Ionicons
                    name="image-outline"
                    size={40}
                    color={colors.shell.mute}
                  />
                </View>
              )}

              {/* Item information */}
              <Text className="mt-4 text-xl font-bold text-foreground">
                {item.title}
              </Text>
              <Text className="mt-1 text-base text-shell-dim">
                {formatFlashPrice(item.priceType, item.price, item.currency)}
              </Text>
              <View className="mt-2 flex-row flex-wrap items-center gap-x-2">
                <Text
                  className={`text-sm font-medium ${flashStatusTone(item.status)}`}
                >
                  {flashLabel(item.status)}
                </Text>
                {item.availabilityLabel ? (
                  <Text
                    className={`text-sm font-medium ${
                      item.bookable ? "text-success-fg" : "text-shell-mute"
                    }`}
                  >
                    · {item.availabilityLabel}
                  </Text>
                ) : !item.isBookable ? (
                  <Text className="text-sm text-shell-mute">· Not bookable</Text>
                ) : null}
              </View>

              {/* Quick main actions */}
              <View className="mt-5 flex-row gap-2">
                <View className="flex-1">
                  <Button
                    label="Edit item"
                    icon={Pencil}
                    onPress={() => onEdit(item.id)}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    label="Share item"
                    icon={Share2}
                    variant="secondary"
                    onPress={share}
                    disabled={!publicUrl}
                  />
                </View>
              </View>

              {/* Small action */}
              {publicUrl ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void WebBrowser.openBrowserAsync(publicUrl)}
                  className="mt-3 h-11 flex-row items-center justify-center gap-1.5 active:opacity-70"
                >
                  <ExternalLink size={15} color={colors.shell.dim} />
                  <Text className="text-sm text-shell-dim">View public page</Text>
                </Pressable>
              ) : (
                <Text className="mt-3 text-center text-xs text-shell-mute">
                  Publish this design to share its public page.
                </Text>
              )}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
