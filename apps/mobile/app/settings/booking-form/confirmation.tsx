import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileConfirmationPage } from "@inklee/shared/mobile-api";
import {
  CONFIRMATION_HEADLINE_MAX,
  CONFIRMATION_MESSAGE_MAX,
  CONFIRMATION_LINK_LABEL_MAX,
} from "@inklee/shared/confirmation-page";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { TextField } from "@/components/TextField";
import { useApiQuery, apiPost, invalidateByPathPrefix } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import { planBoundaryMessage } from "@/lib/plan-errors";

// Custom confirmation page editor (Plus build P3d) — the native twin of the
// web ConfirmationForm. Both post to the same route, which calls the same
// saveConfirmationCore, so the entitlement refusal and the link rule are
// identical on both surfaces.

export default function ConfirmationPageScreen() {
  useScreenView("booking_form_confirmation");
  const q = useApiQuery<MobileConfirmationPage>("/booking-form/confirmation");
  const c = useColors();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <ErrorState
              title="Couldn't load the confirmation page"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <ConfirmationForm data={q.data} />;
}

function ConfirmationForm({ data }: { data: MobileConfirmationPage }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [headline, setHeadline] = useState(data.confirmation.headline ?? "");
  const [message, setMessage] = useState(data.confirmation.message ?? "");
  const [linkUrl, setLinkUrl] = useState(data.confirmation.linkUrl ?? "");
  const [linkLabel, setLinkLabel] = useState(data.confirmation.linkLabel ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    Keyboard.dismiss();
    const url = linkUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setError("The link must start with https://");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPost("/booking-form/confirmation", {
        headline: headline.trim(),
        message: message.trim(),
        linkUrl: url,
        linkLabel: linkLabel.trim(),
      });
      await invalidateByPathPrefix(queryClient, ["/booking-form"]);
      router.back();
    } catch (e) {
      captureError(e, { op: "saveConfirmationPage" });
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
          What a client sees right after sending a request. Leave the headline
          and message empty to use the standard Inklee wording.
        </Text>

        {!data.entitled ? (
          <View className="mb-4 rounded-2xl border border-shell-border bg-glass p-4">
            <Text className="text-sm text-shell-dim">
              A custom confirmation page is part of Plus. Until then clients see
              the standard wording.
            </Text>
          </View>
        ) : null}

        <TextField
          label="Headline"
          value={headline}
          onChangeText={setHeadline}
          placeholder="Request sent"
          maxLength={CONFIRMATION_HEADLINE_MAX}
          autoCapitalize="sentences"
        />

        <TextField
          label="Message"
          value={message}
          onChangeText={setMessage}
          placeholder="Thanks, I'll come back to you within a few days."
          maxLength={CONFIRMATION_MESSAGE_MAX}
          multiline
          autoCapitalize="sentences"
        />

        <TextField
          label="Link"
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder="https://"
          autoCapitalize="none"
          keyboardType="url"
          hint="Optional."
        />

        {linkUrl.trim() ? (
          <TextField
            label="Button text"
            value={linkLabel}
            onChangeText={setLinkLabel}
            placeholder="Read my aftercare guide"
            maxLength={CONFIRMATION_LINK_LABEL_MAX}
            autoCapitalize="sentences"
          />
        ) : null}

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button label="Save" onPress={save} loading={saving} />
      </ScrollView>
    </Screen>
  );
}
