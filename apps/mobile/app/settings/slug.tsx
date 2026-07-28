import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { TextField } from "@/components/TextField";
import { useApiQuery, apiPost, invalidateIdentity } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import { planBoundaryMessage } from "@/lib/plan-errors";

// Custom URL slug (Plus build P3e) — the native twin of the web SlugForm.
// Both post to a route that calls renameSlugCore, so the reserved list, the
// availability check and the entitlement rule are one implementation.

type SlugState = {
  slug: string | null;
  publicUrl: string | null;
  entitled: boolean;
};

export default function SlugScreen() {
  useScreenView("settings_slug");
  const q = useApiQuery<SlugState>("/settings/slug");
  const c = useColors();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <ErrorState
              title="Couldn't load your link"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <SlugForm initial={q.data} />;
}

function SlugForm({ initial }: { initial: SlugState }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const current = initial.slug ?? "";
  const [slug, setSlug] = useState(current);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = slug.trim().toLowerCase() !== current;

  async function save() {
    Keyboard.dismiss();
    setSaving(true);
    setError(null);
    try {
      await apiPost("/settings/slug", { slug: slug.trim().toLowerCase() });
      await invalidateIdentity(queryClient);
      router.back();
    } catch (e) {
      captureError(e, { op: "renameSlug" });
      setError(planBoundaryMessage(e, "Couldn't save. Try again."));
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]} column="form">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
      >
        <Text className="mb-4 text-sm text-shell-dim">
          The address you share with clients.
        </Text>

        <TextField
          label="Your link"
          value={slug}
          onChangeText={(v) => {
            setSlug(v.toLowerCase());
            setConfirmed(false);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={30}
          editable={initial.entitled}
          hint={initial.publicUrl ?? undefined}
        />

        {!initial.entitled ? (
          <View className="mb-4 rounded-2xl border border-shell-border bg-glass p-4">
            <Text className="text-sm text-shell-dim">
              Changing your link is part of Plus.
            </Text>
          </View>
        ) : null}

        {initial.entitled && changed ? (
          <View className="mb-4 rounded-2xl border border-shell-border bg-glass p-4">
            {/* The consequence stated before the tap: nothing redirects the
                old address, so every shared link stops working. */}
            <Text className="text-sm text-foreground">
              Your old link will stop working.
            </Text>
            <Text className="mt-1 text-xs text-shell-dim">
              Anyone with the old address, including your Instagram bio and any
              printed cards or codes, will need the new one.
            </Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              onPress={() => setConfirmed((v) => !v)}
              hitSlop={8}
              className="mt-3 active:opacity-70"
            >
              <Text className="text-sm font-medium text-accent">
                {confirmed ? "Confirmed" : "I understand, update my link"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button
          label="Change link"
          onPress={save}
          loading={saving}
          disabled={!initial.entitled || !changed || !confirmed}
        />
      </ScrollView>
    </Screen>
  );
}
