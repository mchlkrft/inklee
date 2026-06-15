import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Share,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type {
  MobileMe,
  MobileOnboardingComplete,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { useApiQuery, apiPost, invalidateIdentity } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { track } from "@/lib/analytics";
import { config } from "@/lib/config";
import { useColors } from "@/lib/theme";

export default function YoureLive() {
  const themed = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useApiQuery<MobileMe>("/me");
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Completing flips settings.onboarding_completed so the root navigator's /me
  // gate swaps this stack for the tabs — no manual navigation, the same elegant
  // pattern as the session gate. `next` routes onward AFTER the swap (the slots
  // builder for fixed-slots artists): the gate flip is a synchronous cache
  // write, so by the time the timer fires the onboarded tree is mounted.
  async function finish(next?: string) {
    setFinishing(true);
    setError(null);
    try {
      await apiPost<MobileOnboardingComplete>("/onboarding/complete");
      track("onboarding_completed");
      // Flip the gate deterministically off the cache, NOT the refetch:
      // invalidateIdentity resolves even when its background /me refetch fails,
      // which could strand the artist on a spinning button after the server has
      // already completed. The optimistic write swaps to the tabs immediately;
      // the invalidation then reconciles the rest of /me in the background.
      queryClient.setQueryData<MobileMe>(["api", "/me"], (m) =>
        m ? { ...m, onboardingCompleted: true } : m,
      );
      void invalidateIdentity(queryClient);
      if (next) {
        setTimeout(() => router.push(next as never), 0);
      }
      // This screen unmounts as the gate swaps to the tabs — keep the button in
      // its loading state until then rather than resetting `finishing`.
    } catch (e) {
      captureError(e, { op: "onboardingComplete" });
      setError(e instanceof Error ? e.message : "Couldn't finish. Try again.");
      setFinishing(false);
    }
  }

  // /me is normally warm, but a resume entry or a failed refetch can reach here
  // with no data — surface a retry rather than spinning forever (per-screen
  // acceptance gate: every screen needs a loading AND an error state).
  if (!me.data) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-4">
          {me.error ? (
            <>
              <Text className="text-center text-sm text-shell-dim">
                {me.error}
              </Text>
              <View className="mt-5">
                <Button
                  label="Try again"
                  variant="secondary"
                  size="sm"
                  onPress={me.refresh}
                />
              </View>
            </>
          ) : (
            <ActivityIndicator color={themed.accent} />
          )}
        </View>
      </Screen>
    );
  }

  const slug = me.data.slug ?? "you";
  const host = config.publicUrl(slug).replace(/^https:\/\//, "");
  const url = config.publicUrl(slug);
  const isFixedSlots = me.data.bookingMode === "fixed_slots";
  const booksOpen = me.data.booksOpen;

  async function shareLink() {
    try {
      await Share.share({ message: url, url });
    } catch (e) {
      captureError(e, { op: "shareLink" });
    }
  }

  return (
    <Screen>
      <View className="flex-1 pt-4">
        <View className="items-center pb-6">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-[rgba(16,95,45,0.18)]">
            <Ionicons
              name="checkmark-circle"
              size={40}
              color={themed.successFg}
            />
          </View>
        </View>

        <Text className="text-center text-2xl font-bold text-foreground">
          {isFixedSlots ? "Your link is claimed" : "You're live"}
        </Text>
        <Text className="mt-2 text-center text-base text-shell-dim">
          {isFixedSlots
            ? "Publish your slots to start taking bookings."
            : booksOpen
              ? "Your page is open and ready for requests."
              : "Your page is set up. Tap the status pill up top to open your books whenever you're ready."}
        </Text>

        {/* The link */}
        <View className="mt-7 rounded-2xl border border-shell-border bg-glass p-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="link" size={15} color={themed.shell.mute} />
            <Text className="text-xs uppercase tracking-widest text-shell-mute">
              Your booking link
            </Text>
          </View>
          <Text className="mt-2 font-semibold text-foreground">{host}</Text>

          <View className="mt-4 flex-row items-center gap-2">
            <View
              className={`h-2 w-2 rounded-full ${booksOpen ? "bg-success" : "bg-shell-border"}`}
            />
            <Text className="text-sm text-shell-dim">
              {booksOpen ? "Open, accepting requests" : "Closed for now"}
            </Text>
          </View>
        </View>

        <View className="mt-4 gap-3">
          <Button label="Share your link" onPress={shareLink} />
          {isFixedSlots ? (
            <Button
              label="Publish slots"
              variant="secondary"
              loading={finishing}
              onPress={() => {
                void finish("/settings/slots/new");
              }}
            />
          ) : (
            <Button
              label="Send yourself a test request"
              variant="secondary"
              onPress={() => Linking.openURL(url)}
            />
          )}
        </View>

        <View className="mt-5 flex-row items-start gap-2 px-1">
          <Ionicons
            name="bulb-outline"
            size={15}
            color={themed.shell.mute}
            style={{ marginTop: 2 }}
          />
          <Text className="flex-1 text-xs leading-relaxed text-shell-dim">
            Add a logo and set up deposit collection any time from Settings in
            the top-bar menu.
          </Text>
        </View>

        {error ? (
          <Text className="mt-4 text-center text-sm text-danger-fg">{error}</Text>
        ) : null}

        <View className="mt-auto pb-2">
          <Button
            label="Start using Inklee"
            onPress={() => {
              void finish();
            }}
            loading={finishing}
          />
        </View>
      </View>
    </Screen>
  );
}
