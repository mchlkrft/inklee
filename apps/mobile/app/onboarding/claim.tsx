import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { getCalendars } from "expo-localization";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ChevronLeft } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { validateSlug } from "@inklee/shared/slug";
import type {
  MobileSlugCheck,
  MobileOnboardingProfile,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { TextField } from "@/components/TextField";
import { apiGet, apiPost, ApiError, invalidateIdentity } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { config } from "@/lib/config";
import { colors } from "@/lib/tokens";
import { useColors } from "@/lib/theme";

type SlugStatus =
  | "idle"
  | "checking"
  | "available"
  | "owned"
  | "taken"
  | "invalid";

// Live availability for the typed slug: client-side format check first (no
// network), then a 400ms-debounced server check. Stale results are dropped via
// the cancelled flag so the last keystroke always wins.
function useSlugCheck(slug: string) {
  const [status, setStatus] = useState<SlugStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) {
      setStatus("idle");
      setError(null);
      return;
    }
    const formatError = validateSlug(trimmed);
    if (formatError) {
      setStatus("invalid");
      setError(formatError);
      return;
    }
    setStatus("checking");
    setError(null);
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await apiGet<MobileSlugCheck>(
          `/onboarding/slug-check?slug=${encodeURIComponent(trimmed)}`,
        );
        if (cancelled) return;
        if (res.error) {
          setStatus("invalid");
          setError(res.error);
        } else if (res.owned) {
          setStatus("owned");
        } else if (res.available) {
          setStatus("available");
        } else {
          setStatus("taken");
        }
      } catch (e) {
        // Network blip — don't block the artist; leave it neutral and let the
        // submit-time check be the source of truth.
        if (!cancelled) {
          captureError(e, { op: "slugCheck" });
          setStatus("idle");
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [slug]);

  return { status, error };
}

export default function ClaimLink() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const themed = useColors();

  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [instagram, setInstagram] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { status, error: slugError } = useSlugCheck(slug);
  const slugOk = status === "available" || status === "owned";
  const canSubmit = displayName.trim().length > 0 && slugOk && !submitting;

  const previewHost = config
    .publicUrl(slug.trim().toLowerCase() || "you")
    .replace(/^https:\/\//, "");

  async function submit() {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiPost<MobileOnboardingProfile>("/onboarding/profile", {
        slug: slug.trim().toLowerCase(),
        displayName: displayName.trim(),
        instagramHandle: instagram.trim() || undefined,
        location: location.trim() || undefined,
        timezone: getCalendars()[0]?.timeZone ?? undefined,
      });
      // Refresh /me so the next steps (and a resume) see the new slug.
      await invalidateIdentity(queryClient);
      router.push("/onboarding/booking");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setSubmitError("That link was just taken — pick another.");
      } else {
        captureError(e, { op: "claimSlug" });
        setSubmitError(
          e instanceof Error ? e.message : "Couldn't save. Try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Right-aligned availability indicator inside the slug field.
  const slugRightSlot =
    status === "checking" ? (
      <ActivityIndicator color={themed.shell.mute} />
    ) : status === "available" || status === "owned" ? (
      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
    ) : status === "taken" ? (
      <Ionicons name="close-circle" size={20} color={colors.danger} />
    ) : null;

  // Persistent {slug}.inkl.ee preview while typing (the design's hero moment),
  // unless the link is taken/invalid — then the error line takes over.
  const slugHint =
    slug.trim().length === 0
      ? "Letters, numbers and dashes, e.g. jane"
      : status === "owned"
        ? `${previewHost} · already yours`
        : previewHost;
  const slugFieldError =
    status === "taken"
      ? "That link is taken. Try another."
      : status === "invalid"
        ? slugError
        : undefined;

  // Why Continue is disabled — so a first-time artist isn't staring at a greyed
  // button with no cue.
  const disabledReason = submitting
    ? null
    : displayName.trim().length === 0 && !slugOk
      ? "Add your name and pick an available link."
      : displayName.trim().length === 0
        ? "Add your artist or studio name."
        : !slugOk
          ? "Pick an available link to continue."
          : null;

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <View className="-ml-2 mt-1 self-start">
          <IconButton
            icon={ChevronLeft}
            label="Back"
            onPress={() => router.back()}
            iconSize={22}
            color={themed.bone}
          />
        </View>

        <View className="pb-6 pt-2">
          <Text className="text-2xl font-bold text-foreground">
            Claim your booking link
          </Text>
          <Text className="mt-1 text-base text-shell-dim">
            This is where clients land to send you a request.
          </Text>
        </View>

        <View className="mb-2 flex-row items-center gap-2">
          <Ionicons name="eye-outline" size={14} color={themed.shell.mute} />
          <Text className="text-xs uppercase tracking-widest text-shell-mute">
            Clients see this
          </Text>
        </View>

        <TextField
          label="Artist / studio name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Jane Doe"
          autoCapitalize="words"
          returnKeyType="next"
        />

        <TextField
          label="Your link"
          value={slug}
          onChangeText={(v) => setSlug(v.replace(/\s+/g, ""))}
          placeholder="jane"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          rightSlot={slugRightSlot}
          hint={slugHint}
          error={slugFieldError}
        />

        <TextField
          label="Instagram (optional)"
          value={instagram}
          onChangeText={setInstagram}
          placeholder="@yourhandle"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextField
          label="Location (optional)"
          value={location}
          onChangeText={setLocation}
          placeholder="Berlin, DE"
          autoCapitalize="words"
        />

        {submitError ? (
          <Text className="mb-3 text-sm text-danger">{submitError}</Text>
        ) : null}

        <View className="mt-3">
          <Button
            label="Continue"
            onPress={submit}
            loading={submitting}
            disabled={!canSubmit}
          />
          {disabledReason ? (
            <Text className="mt-2 text-center text-xs text-shell-mute">
              {disabledReason}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
