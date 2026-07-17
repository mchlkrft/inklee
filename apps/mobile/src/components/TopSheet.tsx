import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { border, colors, radius } from "@/lib/tokens";
import { useLayoutClass } from "@/lib/layout";

const DURATION = 220;
// Slide distance: comfortably exceeds the tallest panel state so the
// off-screen position always clears the content.
const SLIDE = 460;

// The app's top-sheet: a fixed-dark panel that slides in FROM the top and sits
// at the top (near the thumb that opened it); only the PANEL slides, the
// backdrop just fades 0 -> 30%. Owns the keep-mounted-while-closing dance and
// the Modal/backdrop/panel chrome — consumers (AccountMenuSheet,
// BooksQuickSheet) render only their content. Mount/unmount of the content
// follows `open` with a DURATION lag, so consumers can reset transient state
// in their own effect on `open`.
export function TopSheet({
  open,
  onClose,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessibility label for the tap-to-close backdrop. */
  closeLabel: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // Tablet windows: cap the panel instead of spanning the full width, anchored
  // toward its trigger (top-right burger at medium; the left rail at expanded).
  const cls = useLayoutClass();
  const capped = cls !== "compact";

  // Keep the Modal mounted while the close animation plays out.
  const [mounted, setMounted] = useState(open);
  const progress = useSharedValue(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (open) {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setMounted(true);
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
    transform: [{ translateY: (progress.value - 1) * SLIDE }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}
    >
      {/* Backdrop: opacity-only fade (it must NOT slide). Tap closes. */}
      <Animated.View
        style={[
          { position: "absolute", inset: 0, backgroundColor: "#000" },
          backdrop,
        ]}
      />
      <Pressable
        accessibilityLabel={closeLabel}
        onPress={onClose}
        className="flex-1"
      >
        {/* The panel slides; the inner Pressable stops taps from falling
            through to the backdrop. Fixed-dark chrome in both themes. */}
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
              width: capped ? "100%" : undefined,
              maxWidth: capped ? 420 : undefined,
              alignSelf: capped
                ? cls === "medium"
                  ? "flex-end"
                  : "flex-start"
                : undefined,
              marginHorizontal: capped ? 12 : 0,
            }}
          >
            {children}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
