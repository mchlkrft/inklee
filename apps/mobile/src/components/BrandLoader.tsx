import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/lib/tokens";
import { LOADER_SPIDERWEB_PATH } from "./icons/loader-spiderweb-path";

// The ILLUSTRATION spiderweb (apps/web public/branding/illustrations/spiderweb)
// as the animated brand loader — mirrors the web BrandLoader's inklee-float
// keyframes (gentle rise + 4% scale, 2.6s ease-in-out loop). The optimized NAV
// spiderweb (icons/Spiderweb.tsx) stays the static Flash tab icon.
export function BrandLoader({
  size = 96,
  label,
  color = colors.mustard,
}: {
  size?: number;
  label?: string;
  color?: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true, // reverse = the web's 0% -> 50% -> 100% round trip
    );
  }, [t]);

  const float = useAnimatedStyle(() => ({
    transform: [{ translateY: -7 * t.value }, { scale: 1 + 0.04 * t.value }],
  }));

  return (
    <View accessibilityRole="progressbar" className="items-center gap-3">
      <Animated.View style={float}>
        <Svg width={size} height={size} viewBox="0 0 1234.33814 1224.23232">
          <Path fill={color} d={LOADER_SPIDERWEB_PATH} />
        </Svg>
      </Animated.View>
      {label ? (
        <Text className="text-xs tracking-wide text-shell-dim">{label}</Text>
      ) : null}
    </View>
  );
}

/** Full-screen centered loader — drop-in for the ActivityIndicator splash. */
export function CenterLoader({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center">
      <BrandLoader label={label} />
    </View>
  );
}
