import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
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
import { ImageUploadField } from "@/components/ImageUploadField";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { useApiQuery, apiPost, invalidateIdentity } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { track } from "@/lib/analytics";
import { config } from "@/lib/config";
import { useColors } from "@/lib/theme";

// "Set up when ready" optional features (mirrors the web done step). Each routes
// to the feature AFTER completing onboarding, via finish(route).
const OPTIONAL_FEATURES: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
}[] = [
  { icon: "flash-outline", label: "Flash items", route: "/flash" },
  { icon: "airplane-outline", label: "Guest spots", route: "/travel" },
  { icon: "mail-outline", label: "Email templates", route: "/settings/emails" },
  {
    icon: "card-outline",
    label: "Deposit collection",
    route: "/settings/deposit-defaults",
  },
];

// Mirror the web logo cap (2 MB) so an oversized photo fails before upload.
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

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
  // builder for fixed-slots artists, or an optional-feature shortcut): the gate
  // flip is a synchronous cache write, so by the time the timer fires the
  // onboarded tree is mounted.
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

  // Readiness checklist (mirrors the web done step) — reflects the answers the
  // wizard just collected.
  const checklist = [
    { label: "Profile set up", detail: me.data.displayName ?? host },
    {
      label: "Booking mode",
      detail: isFixedSlots ? "Fixed slots" : "Request a date",
    },
    {
      label: "Availability",
      detail: me.data.booksOpenFlag ? "Open for requests" : "Opening later",
    },
    {
      label: "Booking form ready",
      detail: isFixedSlots
        ? "Publish slots to start taking bookings"
        : "Clients can submit requests",
    },
  ];

  async function shareLink() {
    try {
      await Share.share({ message: url, url });
    } catch (e) {
      captureError(e, { op: "shareLink" });
    }
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
      >
        <OnboardingProgress current={5} />

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

        {/* Readiness checklist */}
        <View className="mt-7 rounded-2xl border border-shell-border bg-glass">
          {checklist.map((item, i) => (
            <View
              key={item.label}
              className={`flex-row items-center gap-3 p-4 ${
                i > 0 ? "border-t border-shell-border" : ""
              }`}
            >
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={themed.successFg}
              />
              <View className="flex-1">
                <Text className="text-sm text-foreground">{item.label}</Text>
                <Text className="mt-0.5 text-xs text-shell-mute">
                  {item.detail}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* The link */}
        <View className="mt-4 rounded-2xl border border-shell-border bg-glass p-4">
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

        {/* Logo (optional) — inline upload, mirrors the web done step. */}
        <Text className="mt-7 text-xs font-semibold uppercase tracking-widest text-shell-mute">
          Add your logo
        </Text>
        <Text className="mb-3 mt-1 text-xs text-shell-dim">
          Optional. Shown on your booking page. PNG, JPG or WebP, max 2 MB.
        </Text>
        <ImageUploadField
          label="Logo"
          imageUrl={null}
          endpoint="/settings/profile/logo"
          shape="circle"
          maxBytes={MAX_LOGO_BYTES}
          onUploaded={() => invalidateIdentity(queryClient)}
        />

        {/* Set up when ready — optional features (mirrors the web done grid). */}
        <Text className="mt-4 text-xs font-semibold uppercase tracking-widest text-shell-mute">
          Set up when ready
        </Text>
        <Text className="mt-1 text-xs text-shell-dim">
          Optional. Configure these whenever they actually help your workflow.
        </Text>
        <View className="mt-3 gap-2">
          {OPTIONAL_FEATURES.map((f) => (
            <Pressable
              key={f.label}
              accessibilityRole="button"
              disabled={finishing}
              onPress={() => {
                void finish(f.route);
              }}
              className="flex-row items-center gap-3 rounded-2xl border border-shell-border bg-glass px-4 py-3 active:opacity-70"
            >
              <Ionicons name={f.icon} size={16} color={themed.shell.dim} />
              <Text className="text-sm text-foreground">{f.label}</Text>
            </Pressable>
          ))}
        </View>

        {error ? (
          <Text className="mt-4 text-center text-sm text-danger-fg">
            {error}
          </Text>
        ) : null}

        <View className="mt-6">
          <Button
            label="Start using Inklee"
            onPress={() => {
              void finish();
            }}
            loading={finishing}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
