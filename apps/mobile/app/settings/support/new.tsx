import { useState } from "react";
import { Keyboard, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_LIMITS,
  validateTicketInput,
  type SupportCategory,
  type SupportTicketInput,
} from "@inklee/shared/support";
import type { MobileSupportCreateResult } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { FieldLabel } from "@/components/FieldLabel";
import { TextField } from "@/components/TextField";
import { TextArea } from "@/components/TextArea";
import { RadioList } from "@/components/RadioList";
import { apiPost, invalidateByPathPrefix } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";

const CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map((c) => ({
  value: c,
  label: SUPPORT_CATEGORY_LABELS[c],
}));

export default function NewSupportTicket() {
  const router = useRouter();
  const themed = useColors();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [steps, setSteps] = useState("");
  const [area, setArea] = useState("");
  const [device, setDevice] = useState("");
  const [context, setContext] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const input: SupportTicketInput = {
      subject: subject.trim(),
      category,
      description: description.trim(),
      expectedBehavior: expected.trim(),
      actualBehavior: actual.trim(),
      reproductionSteps: steps.trim(),
      relevantArea: area.trim(),
      deviceInfo: device.trim(),
      // Auto-tagged so the team knows the request came from the app.
      platformInfo: "Inklee mobile app",
      additionalContext: context.trim(),
    };
    const validationError = validateTicketInput(input);
    if (validationError) {
      setError(validationError);
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await apiPost<MobileSupportCreateResult>("/support", input);
      await invalidateByPathPrefix(queryClient, ["/support"]);
      router.replace(`/settings/support/${id}?created=1`);
    } catch (e) {
      captureError(e, { op: "createSupportTicket" });
      setError(
        e instanceof Error ? e.message : "Couldn't send your request. Try again.",
      );
      setSubmitting(false);
    }
  }

  const categoryLabel = category
    ? SUPPORT_CATEGORY_LABELS[category as SupportCategory]
    : "Pick a category";

  return (
    <Screen edges={["left", "right"]} column="form">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
      >
        <TextField
          label="Subject"
          value={subject}
          onChangeText={setSubject}
          autoCapitalize="sentences"
          maxLength={SUPPORT_LIMITS.subjectMax}
          placeholder="e.g. Clients see an error on my booking page"
        />

        <FieldLabel>Category</FieldLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Category: ${categoryLabel}`}
          accessibilityState={{ expanded: categoryOpen }}
          onPress={() => setCategoryOpen((v) => !v)}
          className="h-12 flex-row items-center justify-between rounded-xl border border-shell-border px-4 active:opacity-80"
        >
          <Text
            className={`text-base ${category ? "text-foreground" : "text-shell-mute"}`}
          >
            {categoryLabel}
          </Text>
          {categoryOpen ? (
            <ChevronUp size={16} color={themed.shell.dim} />
          ) : (
            <ChevronDown size={16} color={themed.shell.dim} />
          )}
        </Pressable>
        {categoryOpen ? (
          <View className="mt-2">
            <RadioList
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(v) => {
                setCategory(v);
                setCategoryOpen(false);
              }}
            />
          </View>
        ) : null}

        <View className="mt-3">
          <FieldLabel>What is going wrong?</FieldLabel>
          <TextArea
            value={description}
            onChangeText={setDescription}
            maxLength={SUPPORT_LIMITS.descriptionMax}
            placeholder="Describe the problem, when it started, and who it affects."
            minHeight={96}
          />
        </View>

        <FieldLabel>What did you expect to happen?</FieldLabel>
        <TextArea
          value={expected}
          onChangeText={setExpected}
          maxLength={SUPPORT_LIMITS.expectedMax}
          placeholder="e.g. The client sees a confirmation page."
          minHeight={64}
        />

        <FieldLabel>What actually happened?</FieldLabel>
        <TextArea
          value={actual}
          onChangeText={setActual}
          maxLength={SUPPORT_LIMITS.actualMax}
          placeholder="e.g. The page shows a generic error."
          minHeight={64}
        />

        <Pressable
          onPress={() => setMoreOpen((v) => !v)}
          className="mb-3 mt-1 flex-row items-center justify-between rounded-xl border border-shell-border px-3 py-3 active:opacity-70"
        >
          <Text className="text-body font-medium text-foreground">
            Optional details
          </Text>
          {moreOpen ? (
            <ChevronUp size={18} color={themed.shell.dim} />
          ) : (
            <ChevronDown size={18} color={themed.shell.dim} />
          )}
        </Pressable>

        {moreOpen ? (
          <>
            <FieldLabel>Steps to reproduce</FieldLabel>
            <TextArea
              value={steps}
              onChangeText={setSteps}
              maxLength={SUPPORT_LIMITS.optionalMax}
              placeholder={"1. Open the calendar\n2. Tap a booked day\n3. ..."}
              minHeight={64}
            />
            <TextField
              label="Relevant page or feature"
              value={area}
              onChangeText={setArea}
              maxLength={SUPPORT_LIMITS.shortFieldMax}
              placeholder="e.g. Bookings calendar"
            />
            <TextField
              label="Device"
              value={device}
              onChangeText={setDevice}
              maxLength={SUPPORT_LIMITS.shortFieldMax}
              placeholder="e.g. iPhone 15, Pixel 8"
            />
            <FieldLabel>Additional context</FieldLabel>
            <TextArea
              value={context}
              onChangeText={setContext}
              maxLength={SUPPORT_LIMITS.optionalMax}
              placeholder="Anything else that helps, like a booking reference. Never include passwords or card numbers."
              minHeight={64}
            />
          </>
        ) : null}

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button
          label="Send support request"
          onPress={submit}
          loading={submitting}
        />
      </ScrollView>
    </Screen>
  );
}
