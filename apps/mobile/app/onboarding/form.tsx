import { useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { MobileBookingFormSettingsUpdate } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { apiPost } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";

// Wizard step 4 (mirrors the web booking-form step). The three "additional"
// field defaults, all ON. Persists through the SAME endpoint the in-app
// booking-form editor uses (/booking-form/settings, one write per key) so there
// is one source of truth for FormSettings. No Skip: Continue commits the
// pre-filled defaults, identical to what a web skip would leave.
type FieldKey =
  | "show_image_upload"
  | "require_description"
  | "show_reference_link";

const FIELDS: { key: FieldKey; title: string; desc: string }[] = [
  {
    key: "show_image_upload",
    title: "Reference image upload",
    desc: "Clients can attach reference photos with their request.",
  },
  {
    key: "require_description",
    title: "Require a description",
    desc: "Clients must describe their tattoo idea before submitting.",
  },
  {
    key: "show_reference_link",
    title: "Reference link field",
    desc: "Clients can paste a link to inspiration (Pinterest, etc.).",
  },
];

export default function FormSetup() {
  const router = useRouter();
  const themed = useColors();

  const [values, setValues] = useState<Record<FieldKey, boolean>>({
    show_image_upload: true,
    require_description: true,
    show_reference_link: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // One write per key (the endpoint flips a single FormSettings boolean).
      // Sequential so the read-modify-writes of profiles.settings don't clobber
      // each other.
      for (const { key } of FIELDS) {
        const body: MobileBookingFormSettingsUpdate = { key, value: values[key] };
        await apiPost("/booking-form/settings", body);
      }
      router.push("/onboarding/done");
    } catch (e) {
      captureError(e, { op: "onboardingForm" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <ScrollView
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

        <View className="mt-2">
          <OnboardingProgress current={4} />
        </View>

        <View className="pb-4">
          <Text className="text-2xl font-bold text-foreground">
            Booking form
          </Text>
          <Text className="mt-1 text-base text-shell-dim">
            What should clients include in their request? These are your
            defaults. You can adjust them later in settings.
          </Text>
        </View>

        <View className="rounded-2xl border border-shell-border bg-glass">
          {FIELDS.map((f, i) => (
            <View
              key={f.key}
              className={`flex-row items-center gap-3 p-4 ${
                i > 0 ? "border-t border-shell-border" : ""
              }`}
            >
              <View className="flex-1">
                <Text className="text-base font-semibold text-foreground">
                  {f.title}
                </Text>
                <Text className="mt-0.5 text-sm text-shell-dim">{f.desc}</Text>
              </View>
              <Switch
                value={values[f.key]}
                onValueChange={(v) =>
                  setValues((prev) => ({ ...prev, [f.key]: v }))
                }
                trackColor={{ false: "rgba(0,0,0,0.35)", true: themed.mustard }}
                thumbColor={themed.bone}
                ios_backgroundColor="rgba(0,0,0,0.35)"
              />
            </View>
          ))}
        </View>

        <Text className="mt-3 text-xs text-shell-dim">
          Clients always provide: Instagram handle, tattoo placement, and
          preferred date. The fields above are additional.
        </Text>

        {error ? (
          <Text className="mt-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <View className="mt-6">
          <Button label="Looks good" onPress={submit} loading={submitting} />
        </View>
      </ScrollView>
    </Screen>
  );
}
