import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { ChevronRight, Settings as SettingsIcon, X } from "lucide-react-native";
import { IconButton } from "./IconButton";
import { apiPost, invalidateBooksViews, useApiQuery } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { border, colors, radius } from "@/lib/tokens";
import type { MobileMe } from "@inklee/shared/mobile-api";

const DURATION = 220;

// Quick open/close control behind the top-bar books pill — the founder's
// "tap the pill, flip the books" round-4 ask. Same top-sheet mechanics as
// AccountMenuSheet (panel slides from the top, backdrop only fades, X sits
// top-right by the thumb). The Switch drives the RAW books_open flag via
// POST /settings/books with an optimistic /me cache patch; the status line
// shows the EFFECTIVE state, and an expired booking window gets an
// explanatory note so the pill never silently disagrees with the switch.
export function BooksQuickSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const meQ = useApiQuery<MobileMe>("/me");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the Modal mounted while the close animation plays out.
  const [mounted, setMounted] = useState(open);
  const progress = useSharedValue(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (open) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setMounted(true);
      setError(null);
      progress.value = withTiming(1, {
        duration: DURATION,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      progress.value = withTiming(0, {
        duration: DURATION,
        easing: Easing.in(Easing.cubic),
      });
      closeTimer.current = setTimeout(() => setMounted(false), DURATION);
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [open, progress]);

  const backdrop = useAnimatedStyle(() => ({
    opacity: 0.3 * progress.value,
  }));
  const panel = useAnimatedStyle(() => ({
    // 460 comfortably exceeds the tallest panel state (note + error lines), so
    // the off-screen position always clears the content (AccountMenuSheet uses
    // the same margin).
    transform: [{ translateY: (progress.value - 1) * 460 }],
  }));

  const me = meQ.data;

  function patchMe(nextFlag: boolean) {
    queryClient.setQueryData<MobileMe>(["api", "/me"], (old) =>
      old
        ? {
            ...old,
            booksOpenFlag: nextFlag,
            booksOpen: nextFlag && !old.bookingWindowExpired,
          }
        : old,
    );
  }

  async function toggle(next: boolean) {
    setPending(true);
    setError(null);
    // Cancel any in-flight /me refetch (e.g. from a rapid previous toggle's
    // invalidation) so a stale response can't clobber the optimistic patch.
    await queryClient.cancelQueries({ queryKey: ["api", "/me"] });
    patchMe(next);
    try {
      await apiPost("/settings/books", { open: next });
      // Reconcile with the server's effective state (window expiry etc.).
      void invalidateBooksViews(queryClient);
    } catch (e) {
      captureError(e, { op: "toggleBooksQuickSheet" });
      patchMe(!next); // clean single revert
      setError("Couldn't update. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!mounted || !me) return null;

  const effectiveOpen = me.booksOpen;
  // ?? booksOpen: a stale deployed API has no booksOpenFlag yet; its booksOpen
  // IS the raw flag, so the Switch stays truthful during the deploy window.
  const flagOn = me.booksOpenFlag ?? me.booksOpen;
  const windowBlocked = !!me.bookingWindowExpired && flagOn;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop: opacity-only fade. Tap closes. */}
      <Animated.View
        style={[
          { position: "absolute", inset: 0, backgroundColor: "#000" },
          backdrop,
        ]}
      />
      <Pressable
        accessibilityLabel="Close booking status"
        onPress={onClose}
        className="flex-1"
      >
        <Animated.View style={panel}>
          <Pressable
            onPress={() => {}}
            className="px-5"
            style={{
              backgroundColor: colors.charcoal,
              borderBottomWidth: border.brand,
              borderColor: colors.shell.border,
              borderBottomLeftRadius: radius.card,
              borderBottomRightRadius: radius.card,
              paddingTop: insets.top + 12,
              paddingBottom: 20,
            }}
          >
            {/* Header: status headline + the X where the pill row sits. */}
            <View
              className="flex-row items-center gap-3 pb-4"
              style={{
                borderBottomWidth: border.hairline,
                borderColor: colors.shell.border,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 9999,
                  backgroundColor: effectiveOpen
                    ? colors.mustard
                    : colors.shell.mute,
                }}
              />
              <Text className="flex-1 text-subtitle font-semibold text-bone">
                {effectiveOpen ? "Books open" : "Books closed"}
              </Text>
              <IconButton
                icon={X}
                label="Close"
                onPress={onClose}
                outlined
                borderColor={colors.shell.border}
                color={colors.bone}
              />
            </View>

            <View className="flex-row items-center justify-between pt-4">
              <View className="flex-1 pr-3">
                <Text className="text-body font-medium text-bone">
                  Accept new requests
                </Text>
                {/* Static shell color: this panel is fixed-dark chrome, so the
                    themed text-shell-dim class would go near-invisible in the
                    light theme. */}
                <Text
                  className="mt-0.5 text-sm"
                  style={{ color: colors.shell.dim }}
                >
                  {windowBlocked
                    ? "Requests open once your booking window allows it."
                    : flagOn
                      ? "Clients can send booking requests."
                      : "Your page shows a closed notice."}
                </Text>
              </View>
              <Switch
                value={flagOn}
                onValueChange={toggle}
                disabled={pending}
                accessibilityLabel="Accept new requests"
                trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
                thumbColor={colors.bone}
                ios_backgroundColor="rgba(0,0,0,0.35)"
              />
            </View>

            {windowBlocked ? (
              <Text className="mt-2 text-xs" style={{ color: colors.shell.dim }}>
                Your booking window has ended, so your page still shows closed.
                Adjust the window in booking settings.
              </Text>
            ) : null}
            {error ? (
              <Text className="mt-2 text-xs text-danger">{error}</Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                router.push("/settings/books");
              }}
              className="mt-3 flex-row items-center gap-3 py-3 active:opacity-60"
            >
              <SettingsIcon size={20} color={colors.shell.dim} />
              <Text className="flex-1 text-body text-bone">
                Booking settings
              </Text>
              <ChevronRight size={16} color={colors.shell.mute} />
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
