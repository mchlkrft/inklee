import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react-native";
import type { CustomFieldType } from "@inklee/shared/custom-fields";
import type {
  MobileBookingForm,
  MobileBookingFormField,
  MobileBookingFormFieldInput,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { FieldLabel } from "@/components/FieldLabel";
import { IconButton } from "@/components/IconButton";
import { PillButton } from "@/components/PillButton";
import { RadioList } from "@/components/RadioList";
import { TextField } from "@/components/TextField";
import {
  useApiQuery,
  apiPatch,
  apiPost,
  invalidateByPathPrefix,
} from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";

// Custom-field editor — the native port of the web FieldForm. fieldId "new"
// creates; anything else edits that field (seeded from the cached
// /booking-form query the index screen loaded). The key is never shown: the
// server derives it from the label on create and it is immutable after.

// The web FieldForm's type labels, verbatim. Values are checked against the
// shared CustomFieldType union at compile time.
const TYPE_OPTIONS: readonly { value: CustomFieldType; label: string }[] = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Radio group" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
];

const OPTION_TYPES: readonly CustomFieldType[] = ["select", "radio"];
const PLACEHOLDER_TYPES: readonly CustomFieldType[] = [
  "short_text",
  "long_text",
  "number",
  "date",
];

export default function CustomFieldEditorScreen() {
  useScreenView("booking_form_field");
  const { fieldId } = useLocalSearchParams<{ fieldId: string }>();
  const isNew = fieldId === "new";
  const q = useApiQuery<MobileBookingForm>("/booking-form");
  const themed = useColors();

  if (isNew) return <FieldForm field={null} />;

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load the field"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  const field = q.data.fields.find(
    (f) => f.id === fieldId && f.kind === "custom",
  );
  if (!field) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          <ErrorState
            title="Field not found"
            subtitle="It may have been removed."
            onRetry={q.refresh}
          />
        </View>
      </Screen>
    );
  }
  return <FieldForm field={field} />;
}

function FieldForm({ field }: { field: MobileBookingFormField | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const c = useColors();

  const [label, setLabel] = useState(field?.label ?? "");
  const [type, setType] = useState<CustomFieldType>(
    field?.custom?.type ?? "short_text",
  );
  const [required, setRequired] = useState(field?.required ?? false);
  const [placeholder, setPlaceholder] = useState(
    field?.custom?.placeholder ?? "",
  );
  const [helpText, setHelpText] = useState(field?.custom?.helpText ?? "");
  const [options, setOptions] = useState<string[]>(
    field?.custom?.options ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showOptions = OPTION_TYPES.includes(type);
  const showPlaceholder = PLACEHOLDER_TYPES.includes(type);

  function changeType(next: CustomFieldType) {
    setType(next);
    // Dropdown / radio group need at least 2 options — seed two empty rows so
    // the requirement is visible, not a surprise on save.
    if (OPTION_TYPES.includes(next) && options.length < 2) {
      setOptions((cur) => [...cur, ...Array(2 - cur.length).fill("")]);
    }
  }

  async function save() {
    Keyboard.dismiss();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("Label is required.");
      return;
    }
    const cleanOptions = showOptions
      ? options.map((o) => o.trim()).filter(Boolean)
      : [];
    if (showOptions && cleanOptions.length < 2) {
      setError("Add at least 2 options.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: MobileBookingFormFieldInput = {
        // On create the server derives the key from the label (the web's
        // hidden-input behavior); on edit the stored key rides along for
        // validation but is never written.
        key: field?.custom?.key,
        label: trimmedLabel,
        type,
        required,
        placeholder: showPlaceholder
          ? placeholder.trim() || undefined
          : undefined,
        help_text: helpText.trim() || undefined,
        options: cleanOptions,
      };
      if (field) {
        await apiPatch(`/booking-form/fields/${field.id}`, payload);
      } else {
        await apiPost("/booking-form/fields", payload);
      }
      await invalidateByPathPrefix(queryClient, ["/booking-form"]);
      router.back();
    } catch (e) {
      captureError(e, { op: "saveBookingFormField" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
      >
        <TextField
          label="Label"
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. Skin type"
          maxLength={100}
          autoCapitalize="sentences"
        />

        <FieldLabel>Type</FieldLabel>
        <RadioList options={TYPE_OPTIONS} value={type} onChange={changeType} />

        {showOptions ? (
          <>
            <FieldLabel>Options</FieldLabel>
            {options.map((opt, i) => (
              <View key={i} className="flex-row items-center gap-2">
                <View className="flex-1">
                  <TextField
                    value={opt}
                    onChangeText={(v) =>
                      setOptions((cur) =>
                        cur.map((o, j) => (j === i ? v : o)),
                      )
                    }
                    placeholder={`Option ${i + 1}`}
                    maxLength={100}
                  />
                </View>
                <View className="mb-3">
                  <IconButton
                    icon={X}
                    label={`Remove option ${i + 1}`}
                    outlined
                    iconSize={14}
                    color={c.bone}
                    onPress={() =>
                      setOptions((cur) => cur.filter((_, j) => j !== i))
                    }
                  />
                </View>
              </View>
            ))}
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="flex-1 pr-3 text-xs text-shell-dim">
                At least 2 options.
              </Text>
              <PillButton
                label="Add option"
                onPress={() => setOptions((cur) => [...cur, ""])}
              />
            </View>
          </>
        ) : null}

        {showPlaceholder ? (
          <TextField
            label="Placeholder"
            value={placeholder}
            onChangeText={setPlaceholder}
            placeholder="Shown inside the empty field"
            maxLength={200}
            hint="Optional."
          />
        ) : null}

        <TextField
          label="Help text"
          value={helpText}
          onChangeText={setHelpText}
          placeholder="Shown under the field"
          maxLength={500}
          hint="Optional."
        />

        <View className="mb-3 mt-1 flex-row items-center justify-between rounded-2xl border border-shell-border bg-glass p-4">
          <View className="flex-1 pr-3">
            <Text className="text-base font-semibold text-foreground">
              Required field
            </Text>
            <Text className="mt-0.5 text-sm text-shell-dim">
              Clients must fill this before submitting.
            </Text>
          </View>
          <Switch
            value={required}
            onValueChange={setRequired}
            trackColor={{ false: "rgba(0,0,0,0.35)", true: c.mustard }}
            thumbColor={c.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        </View>

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button
          label={field ? "Save changes" : "Add field"}
          onPress={save}
          loading={saving}
        />
      </ScrollView>
    </Screen>
  );
}
