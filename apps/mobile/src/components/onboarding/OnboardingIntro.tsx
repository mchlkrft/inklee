import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { colors } from "@/lib/tokens";

// Native port of the web onboarding intro (welcome-slides.tsx) — a 3-slide
// "story" that auto-advances, pauses while pressed, and lets the artist tap
// left/right to move between slides. Graphics are placeholder brand cards +
// icons for v1 (real illustrations = follow-up FU-13). Skip and the final "Get
// started" both call onDone, which routes on to the claim step.

const SLIDE_MS = 5000;

type Slide = {
  bg: string; // NativeWind brand bg class
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    bg: "bg-mustard",
    icon: "link-outline",
    eyebrow: "Your booking link",
    title: "One link. Every booking.",
    body: "Drop a single Inklee link in your Instagram bio. Clients tap it to start a request. No more booking chaos buried in your DMs.",
  },
  {
    bg: "bg-rosa",
    icon: "albums-outline",
    eyebrow: "Your inbox",
    title: "Requests, already sorted.",
    body: "Every client tells you placement, style, size and a reference up front. Each request lands in one tidy inbox, ready to review.",
  },
  {
    bg: "bg-success",
    icon: "checkmark-circle-outline",
    eyebrow: "Your calendar",
    title: "Review, accept, done.",
    body: "Accept or pass with a tap. Accepted bookings move straight to your calendar, so you stay in control.",
  },
];

export function OnboardingIntro({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  // Don't auto-advance while a screen reader is active — VoiceOver/TalkBack users
  // need to read at their own pace (Next + Skip still work).
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (mounted) setScreenReader(on);
    });
    const sub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReader,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Auto-advance unless paused, on the last slide, or under a screen reader.
  // Re-runs (and resets the timer) whenever the slide changes or pause toggles.
  useEffect(() => {
    if (paused || isLast || screenReader) return;
    const id = setTimeout(
      () => setIndex((i) => Math.min(i + 1, SLIDES.length - 1)),
      SLIDE_MS,
    );
    return () => clearTimeout(id);
  }, [index, paused, isLast, screenReader]);

  // Distinguish a quick tap (navigate) from a deliberate press-and-hold (pause
  // to keep reading) — mirrors the web story gesture.
  const pressStart = useRef(0);
  const onPressIn = () => {
    pressStart.current = Date.now();
    setPaused(true);
  };
  const onPressOut = (dir: "prev" | "next") => {
    const held = Date.now() - pressStart.current;
    setPaused(false);
    if (held < 250) {
      if (dir === "prev") setIndex((i) => Math.max(i - 1, 0));
      else setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
    }
  };

  return (
    <Screen>
      <View className="flex-1 pt-2">
        {/* Story progress — one segment per slide. */}
        <View className="mb-5 flex-row gap-1.5">
          {SLIDES.map((_, i) => (
            <View
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i <= index ? "bg-bone" : "bg-[rgba(229,225,213,0.18)]"
              }`}
            />
          ))}
        </View>

        {/* Visual card with tap zones (left third = back, right = forward). */}
        <View className="relative">
          <View
            className={`aspect-[4/5] w-full items-center justify-center rounded-[28px] ${slide.bg}`}
          >
            <View className="h-24 w-24 items-center justify-center rounded-full bg-[rgba(30,30,30,0.12)]">
              <Ionicons name={slide.icon} size={52} color={colors.charcoal} />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous"
            onPressIn={onPressIn}
            onPressOut={() => onPressOut("prev")}
            className="absolute inset-y-0 left-0 w-1/3"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next"
            onPressIn={onPressIn}
            onPressOut={() => onPressOut("next")}
            className="absolute inset-y-0 right-0 w-2/3"
          />
        </View>

        {/* Copy */}
        <View className="mt-6 gap-2">
          <Text className="text-xs font-semibold uppercase tracking-widest text-shell-dim">
            {slide.eyebrow}
          </Text>
          <Text className="text-2xl font-bold text-foreground">{slide.title}</Text>
          <Text className="text-base leading-relaxed text-shell-dim">
            {slide.body}
          </Text>
        </View>

        {/* Controls pinned to the bottom. */}
        <View className="mt-auto gap-3 pb-2">
          {isLast ? (
            <Button label="Get started" onPress={onDone} />
          ) : (
            <Button
              label="Next"
              variant="secondary"
              onPress={() => setIndex((i) => Math.min(i + 1, SLIDES.length - 1))}
            />
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onDone}
            className="h-11 items-center justify-center active:opacity-70"
          >
            <Text className="text-sm text-shell-dim">Skip intro</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
