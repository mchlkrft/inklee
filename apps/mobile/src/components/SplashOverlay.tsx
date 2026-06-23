import { useEffect } from "react";
import { Text } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
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

// Branded JS splash: just the breathing spiderweb + the inklee wordmark, centered
// on the app background — no card frame. The spiderweb scales up and down while
// the session + /me gate resolves; when the app is ready the whole overlay fades
// out over the mounted UI. Colors follow the theme (charcoal bg + bone mark in
// dark, bone bg + charcoal mark in light), so the native splash hands off to it
// without a flash.

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
  const bg = dark ? colors.charcoal : colors.bone;
  const ink = dark ? colors.bone : colors.charcoal;

  const pulse = useSharedValue(0);
  const opacity = useSharedValue(1);

  // The native splash is the same solid bg color — hide it as soon as this
  // overlay is mounted so the lockup appears on top without a flash.
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
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        },
        fade,
      ]}
    >
      <StatusBar style={dark ? "light" : "dark"} />
      <Animated.View style={breathe}>
        <Svg width={WEB_SIZE} height={WEB_SIZE} viewBox="0 0 1234.33814 1224.23232">
          <Path fill={ink} d={LOADER_SPIDERWEB_PATH} />
        </Svg>
      </Animated.View>
      <Text style={{ color: ink, fontSize: 36, fontWeight: "700", marginTop: 28 }}>
        inklee
      </Text>
    </Animated.View>
  );
}
