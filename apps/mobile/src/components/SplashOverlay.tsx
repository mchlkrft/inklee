import { useEffect } from "react";
import { Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/lib/tokens";
import { useThemePreference } from "@/lib/theme";
import { LOADER_SPIDERWEB_PATH } from "./icons/loader-spiderweb-path";

// Branded JS splash (founder reference: a rounded card floating on a solid
// layer with the same distance to every edge — something the static native
// splash can't do responsively, so the native phase is just the solid layer
// color and this overlay draws the card on top of it). The spiderweb breathes
// (scales up and down) while the session + /me gate resolves; when the app is
// ready the whole overlay fades out over the mounted UI.
//
// Mode mapping per the founder's mockups: DARK mode = charcoal card on a bone
// layer; light mode = bone card on a charcoal layer. Colors are pinned (not
// themed classNames) because the inversion is unique to this surface.

const INSET = 20; // equal distance to top/bottom and sides on every device
const RADIUS = 44;
const WEB_SIZE = 150;

export function SplashOverlay({
  ready,
  onDone,
}: {
  /** Flips true when the boot gate resolved — starts the fade-out. */
  ready: boolean;
  /** Fired after the fade completes; the parent unmounts the overlay. */
  onDone: () => void;
}) {
  const { scheme } = useThemePreference();
  const dark = scheme === "dark";
  const layer = dark ? colors.bone : colors.charcoal;
  const card = dark ? colors.charcoal : colors.bone;
  const ink = dark ? colors.bone : colors.charcoal;

  const pulse = useSharedValue(0);
  const opacity = useSharedValue(1);

  // The native splash is the same solid layer color — hide it as soon as this
  // overlay is mounted so the card appears on top without a flash.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  useEffect(() => {
    if (!ready) return;
    opacity.value = withTiming(
      0,
      { duration: 400, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(onDone)();
      },
    );
  }, [ready, onDone, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const breathe = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.08 * pulse.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: layer,
        },
        fade,
      ]}
    >
      <View
        style={{
          position: "absolute",
          top: INSET,
          bottom: INSET,
          left: INSET,
          right: INSET,
          borderRadius: RADIUS,
          backgroundColor: card,
          alignItems: "center",
        }}
      >
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Animated.View style={breathe}>
            <Svg
              width={WEB_SIZE}
              height={WEB_SIZE}
              viewBox="0 0 1234.33814 1224.23232"
            >
              <Path fill={ink} d={LOADER_SPIDERWEB_PATH} />
            </Svg>
          </Animated.View>
        </View>
        <Text
          style={{
            color: ink,
            fontSize: 36,
            fontWeight: "700",
            marginBottom: 72,
          }}
        >
          inklee
        </Text>
      </View>
    </Animated.View>
  );
}
