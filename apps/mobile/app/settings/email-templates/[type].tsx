import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { templateBodySchema } from "@inklee/shared/email-templates";
import type {
  MobileEmailTemplate,
  MobileEmailTemplateReset,
  MobileEmailTemplatesResponse,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextArea } from "@/components/TextArea";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost } from "@/lib/api";
import { useScreenView } from "@/lib/analytics";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { colors } from "@/lib/tokens";

const BODY_MAX = 2000;
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const TEMPLATES_KEY = ["api", "/settings/email-templates"];

// Template editor — edit one booking email's body, toggle whether it sends, or
// reset it to the system default. Mirrors the web modal editor
// (settings/emails/template-editor.tsx): same validation, a 0/2000 counter
// that turns red past the limit (no hard clip — the server stays the gate),
// the calm inline reset confirm and the brief "Saved." before closing. Mobile
// improvement over web: the merge-variable chips are tappable and insert the
// token at the cursor.
export default function TemplateEditorScreen() {
  useScreenView("settings_email_template");
  const { type } = useLocalSearchParams<{ type: string }>();
  const navigation = useNavigation();
  const q = useApiQuery<MobileEmailTemplatesResponse>(
    "/settings/email-templates",
  );
  const tpl = q.data?.items.find((t) => t.type === type) ?? null;

  const title = tpl?.label;
  useEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [navigation, title]);

  if (!tpl) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <ErrorState
              title="Couldn't load template"
              subtitle={q.data ? "Unknown template." : (q.error ?? undefined)}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <TemplateForm
      key={tpl.type}
      initial={tpl}
      allowedVars={q.data?.allowedVars ?? []}
    />
  );
}

function TemplateForm({
  initial,
  allowedVars,
}: {
  initial: MobileEmailTemplate;
  allowedVars: string[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const themed = useColors();

  const [body, setBody] = useState(initial.body);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [edited, setEdited] = useState(initial.edited);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Last known cursor position — the variable chips insert their token here
  // (typing {{}} on a phone keyboard is painful). Falls back to appending.
  const selection = useRef<{ start: number; end: number } | null>(null);
  // Auto-close timer (the brief "Saved." before router.back). Cleared on
  // unmount so backing out manually can't pop a second screen.
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (backTimer.current) clearTimeout(backTimer.current);
    },
    [],
  );

  function insertVar(name: string) {
    const token = `{{${name}}}`;
    const sel = selection.current;
    const start = Math.min(sel?.start ?? body.length, body.length);
    const end = Math.min(sel?.end ?? body.length, body.length);
    setBody(body.slice(0, start) + token + body.slice(end));
    selection.current = {
      start: start + token.length,
      end: start + token.length,
    };
    setConfirmingReset(false);
  }

  async function save() {
    Keyboard.dismiss();
    const trimmed = body.trim();
    // Same schema the server re-runs — instant inline errors; the server
    // stays authoritative.
    const parsed = templateBodySchema.safeParse(trimmed);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPost("/settings/email-templates", {
        type: initial.type,
        body: trimmed,
      });
      await queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      setSaved(true);
      backTimer.current = setTimeout(() => router.back(), 700);
    } catch (e) {
      captureError(e, { op: "saveEmailTemplate" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(next: boolean) {
    setToggling(true);
    setEnabled(next); // optimistic; reverted on failure
    setError(null);
    try {
      await apiPost("/settings/email-templates/toggle", {
        type: initial.type,
        enabled: next,
      });
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    } catch (e) {
      captureError(e, { op: "toggleEmailTemplate" });
      setEnabled(!next);
      setError("Couldn't update. Try again.");
    } finally {
      setToggling(false);
    }
  }

  async function reset() {
    setConfirmingReset(false);
    setResetting(true);
    setError(null);
    try {
      const res = await apiPost<MobileEmailTemplateReset>(
        "/settings/email-templates/reset",
        { type: initial.type },
      );
      setBody(res.body);
      setEdited(false);
      selection.current = null;
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
    } catch (e) {
      captureError(e, { op: "resetEmailTemplate" });
      setError(e instanceof Error ? e.message : "Couldn't reset. Try again.");
    } finally {
      setResetting(false);
    }
  }

  const overLimit = body.length > BODY_MAX;
  // The web editor compares against the system default, which never ships to
  // the client here — approximate with "saved as edited on the server, or
  // changed locally this session".
  const isCustomised = edited || body !== initial.body;

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
      >
        {/* Header card: label + fixed subject + send toggle */}
        <View className="mb-4 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass p-4">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-foreground">
              {initial.label}
            </Text>
            <Text
              className="mt-0.5 text-xs text-shell-dim"
              style={{ fontFamily: MONO }}
              numberOfLines={1}
            >
              {initial.subject}
            </Text>
            <Text className="mt-1 text-xs text-shell-mute">
              {enabled
                ? "This email is sent automatically."
                : "This email is turned off."}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={toggle}
            disabled={toggling}
            accessibilityLabel="Send this email"
            trackColor={{ false: "rgba(0,0,0,0.35)", true: themed.mustard }}
            thumbColor={themed.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        </View>

        <Text className="mb-1.5 text-sm font-medium text-foreground">
          Variables
        </Text>
        <Text className="mb-2 text-xs text-shell-dim">
          Tap one to insert it. Variables are replaced with real values when
          the email is sent.
        </Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {allowedVars.map((v) => (
            <Pressable
              key={v}
              accessibilityRole="button"
              disabled={!enabled}
              onPress={() => insertVar(v)}
              className={`rounded-full bg-shell-hover px-2.5 py-1 ${
                enabled ? "active:opacity-70" : "opacity-40"
              }`}
            >
              <Text
                className="text-xs text-shell-dim"
                style={{ fontFamily: MONO }}
              >
                {`{{${v}}}`}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className={enabled ? "" : "opacity-40"}>
          <TextArea
            label="Body"
            value={body}
            onChangeText={(v) => {
              setBody(v);
              setConfirmingReset(false);
            }}
            editable={enabled}
            minHeight={180}
            autoCapitalize="none"
            autoCorrect={false}
            onSelectionChange={(e) => {
              selection.current = e.nativeEvent.selection;
            }}
            style={{ fontFamily: MONO, fontSize: 14 }}
          />
        </View>

        <View className="mb-4 flex-row flex-wrap items-center justify-between gap-2">
          <Text
            className={`text-xs ${overLimit ? "text-danger" : "text-shell-mute"}`}
          >
            {body.length}/{BODY_MAX}
          </Text>
          {confirmingReset ? (
            <View className="flex-row items-center gap-3">
              <Text className="text-xs text-shell-dim">
                Restore system default?
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={resetting}
                onPress={reset}
                className="active:opacity-70"
              >
                <Text className="text-xs font-semibold text-danger">
                  Yes, reset
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmingReset(false)}
                className="active:opacity-70"
              >
                <Text className="text-xs text-shell-mute">Cancel</Text>
              </Pressable>
            </View>
          ) : isCustomised ? (
            <Pressable
              accessibilityRole="button"
              disabled={resetting || !enabled}
              onPress={() => setConfirmingReset(true)}
              className={
                resetting || !enabled ? "opacity-40" : "active:opacity-70"
              }
            >
              <Text className="text-xs text-shell-dim underline">
                {resetting ? "Resetting…" : "Reset to default"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
        ) : null}
        {saved ? (
          <Text className="mb-3 text-sm text-success">Saved.</Text>
        ) : null}

        <Button
          label="Save"
          onPress={save}
          loading={saving}
          disabled={!enabled || saved}
        />
      </ScrollView>
    </Screen>
  );
}
