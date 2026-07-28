import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { SectionLabel } from "@/components/SectionLabel";
import { useApiQuery, apiPatch } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import { planBoundaryMessage } from "@/lib/plan-errors";
import {
  APPEARANCE_THEMES,
  APPEARANCE_FONTS,
  BUTTON_TREATMENTS,
  BUTTON_RADII,
  type AppearanceSettings,
  type AppearanceTheme,
  type AppearanceFontId,
  type ButtonTreatment,
  type ButtonRadius,
} from "@inklee/shared/appearance";
import { COVER_COLORS } from "@inklee/shared/cover-colors";

// The native twin of the web /settings/appearance editor (Plus build P1b).
// Named "Page appearance" deliberately: the settings index already has an
// Appearance section for the APP's own light/dark preference, and these are
// different things (this one styles the artist's PUBLIC pages).
//
// Writes through PATCH /api/mobile/settings/appearance, which wraps the same
// saveAppearanceCore the web action uses, so entitlement and validation cannot
// drift between surfaces.

const THEME_LABELS: Record<AppearanceTheme, string> = {
  light: "Light",
  dark: "Dark",
  auto: "Match the visitor",
};
const TREATMENT_LABELS: Record<ButtonTreatment, string> = {
  solid: "Solid",
  outline: "Outline",
  soft: "Soft",
};
const RADIUS_LABELS: Record<ButtonRadius, string> = {
  sharp: "Sharp",
  soft: "Soft",
  round: "Round",
};

type Response = { appearance: AppearanceSettings; entitled: boolean };

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`mr-2 mb-2 rounded-full border px-4 py-2 active:opacity-70 ${
        active
          ? "border-transparent bg-mustard"
          : "border-shell-border bg-chrome"
      }`}
    >
      <Text
        className={`text-sm ${active ? "font-semibold" : ""}`}
        style={{ color: active ? "#1e1e1e" : undefined }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function PageAppearanceScreen() {
  useScreenView("settings_page_appearance");
  const colors = useColors();
  const queryClient = useQueryClient();
  const q = useApiQuery<Response>("/settings/appearance");

  const [theme, setTheme] = useState<AppearanceTheme | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [font, setFont] = useState<AppearanceFontId | null>(null);
  const [treatment, setTreatment] = useState<ButtonTreatment | null>(null);
  const [radius, setRadius] = useState<ButtonRadius | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (q.data && theme === null) {
      const g = q.data.appearance.global;
      setTheme(g.theme);
      setAccent(g.accent);
      setFont(g.font);
      setTreatment(g.buttonTreatment);
      setRadius(g.buttonRadius);
    }
  }, [q.data, theme]);

  if (!q.data || theme === null) {
    return (
      <Screen edges={["left", "right"]}>
        {q.loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ErrorState
            title="Couldn't load your appearance."
            subtitle={q.error ?? undefined}
            onRetry={q.refresh}
          />
        )}
      </Screen>
    );
  }

  const touch = () => setSaved(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiPatch("/settings/appearance", {
        theme,
        accent,
        font,
        buttonTreatment: treatment,
        buttonRadius: radius,
      });
      await queryClient.invalidateQueries({
        queryKey: ["api", "/settings/appearance"],
      });
      setSaved(true);
    } catch (e) {
      setError(planBoundaryMessage(e, "Couldn't save. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={["left", "right"]} column="form">
      <View className="flex-1 pt-3">
        <Text className="mb-3 text-sm text-shell-dim">
          Make Inklee yours. These choices apply to your public pages: your
          Inklee page, your booking form, and your shop.
        </Text>

        {!q.data.entitled && (
          <Card>
            <Text className="text-sm text-foreground">
              Custom appearance is part of Plus. Your current colour and cover
              image stay exactly as they are.
            </Text>
          </Card>
        )}

        <SectionLabel>Theme</SectionLabel>
        <Card>
          <View className="flex-row flex-wrap">
            {APPEARANCE_THEMES.map((t) => (
              <Chip
                key={t}
                label={THEME_LABELS[t]}
                active={theme === t}
                onPress={() => {
                  touch();
                  setTheme(t);
                }}
              />
            ))}
          </View>
        </Card>

        <SectionLabel>Accent colour</SectionLabel>
        <Card>
          <View className="flex-row flex-wrap items-center">
            <Chip
              label="None"
              active={accent === null}
              onPress={() => {
                touch();
                setAccent(null);
              }}
            />
            {COVER_COLORS.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => {
                  touch();
                  setAccent(c.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                accessibilityState={{ selected: accent === c.id }}
                className={`mr-2 mb-2 h-10 w-10 rounded-full border-2 active:opacity-70 ${
                  accent === c.id ? "border-foreground" : "border-shell-border"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </View>
        </Card>

        <SectionLabel>Typography</SectionLabel>
        <Card>
          <View className="flex-row flex-wrap">
            {APPEARANCE_FONTS.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                active={font === f.id}
                onPress={() => {
                  touch();
                  setFont(f.id);
                }}
              />
            ))}
          </View>
        </Card>

        <SectionLabel>Buttons</SectionLabel>
        <Card>
          <View className="flex-row flex-wrap">
            {BUTTON_TREATMENTS.map((t) => (
              <Chip
                key={t}
                label={TREATMENT_LABELS[t]}
                active={treatment === t}
                onPress={() => {
                  touch();
                  setTreatment(t);
                }}
              />
            ))}
          </View>
          <View className="mt-2 flex-row flex-wrap">
            {BUTTON_RADII.map((r) => (
              <Chip
                key={r}
                label={RADIUS_LABELS[r]}
                active={radius === r}
                onPress={() => {
                  touch();
                  setRadius(r);
                }}
              />
            ))}
          </View>
        </Card>

        {error && <Text className="mt-3 text-sm text-danger">{error}</Text>}
        {saved && <Text className="mt-3 text-sm text-shell-dim">Saved.</Text>}

        <View className="mt-4">
          <Button
            label={saving ? "Saving…" : "Save appearance"}
            onPress={save}
            disabled={saving}
          />
        </View>
      </View>
    </Screen>
  );
}
