import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  DATE_FLEXIBILITIES,
  DATE_FLEXIBILITY_LABELS,
  GS_EQUIPMENT_MAX,
  GS_EXPECTED_CLIENTS_MAX,
  GS_INTRO_MAX,
  GS_SOCIAL_LINK_MAX,
  validateGuestSpotRequestInput,
  type DateFlexibility,
  type GuestSpotRequestInput,
} from "@inklee/shared/guest-spots";
import type { MobileGuestSpotRequestResult } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { BorderedInput } from "@/components/BorderedInput";
import { DateRangeField } from "@/components/DateRangeField";
import { FieldLabel } from "@/components/FieldLabel";
import { TextArea } from "@/components/TextArea";
import { apiPost, ApiError } from "@/lib/api";
import { useScreenView } from "@/lib/analytics";

// Guest-spot request from a map pin: the native twin of /map/[id]/request.
// Shared validation (validateGuestSpotRequestInput) runs client-side first;
// the mobile route re-runs it inside the SAME server core the web form uses.

// UTC on purpose: the server core validates against the SAME UTC key
// (guest-spots.ts), so the client must mirror it or a submit the client
// accepted would bounce server-side. A timezone-tolerant rule would need to
// change the shared core and both clients together.
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DiscoverRequestScreen() {
  useScreenView("map_guest_spot_request");
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const locationId = String(params.id ?? "");
  const studioName = String(params.name ?? "this studio");

  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [flexibility, setFlexibility] = useState<DateFlexibility>("exact");
  const [socialLink, setSocialLink] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [expectedClients, setExpectedClients] = useState("");
  const [equipmentNeeds, setEquipmentNeeds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    const input: GuestSpotRequestInput = {
      startDate: startDate ?? "",
      endDate: endDate ?? startDate ?? "",
      dateFlexibility: flexibility,
      socialLink: socialLink.trim(),
      introduction: introduction.trim(),
      expectedClients: expectedClients.trim() || null,
      equipmentNeeds: equipmentNeeds.trim() || null,
    };
    const invalid = validateGuestSpotRequestInput(input, todayKey());
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    try {
      await apiPost<MobileGuestSpotRequestResult>(
        `/map/locations/${locationId}/request`,
        input,
      );
      Alert.alert(
        "Request sent",
        `Your guest spot request is on its way to ${studioName}. You can track it on the web under Guest Spots.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not send the request.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen edges={["left", "right"]} column="form">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingVertical: 16, gap: 16 }}
      >
        <Text className="text-sm text-shell-mute">
          Request a guest spot at {studioName}. The studio reviews it and gets
          back to you.
        </Text>

        <View>
          <DateRangeField
            label="When do you want to come?"
            startValue={startDate}
            endValue={endDate}
            onChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
        </View>

        <View>
          <FieldLabel>Date flexibility</FieldLabel>
          <View className="flex-row gap-2">
            {DATE_FLEXIBILITIES.map((f) => (
              <Button
                key={f}
                label={DATE_FLEXIBILITY_LABELS[f]}
                size="sm"
                variant={flexibility === f ? "primary" : "secondary"}
                onPress={() => setFlexibility(f)}
              />
            ))}
          </View>
        </View>

        <View>
          <FieldLabel>Your Instagram or portfolio link</FieldLabel>
          <BorderedInput
            value={socialLink}
            onChangeText={setSocialLink}
            placeholder="https://instagram.com/you"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={GS_SOCIAL_LINK_MAX}
          />
        </View>

        <View>
          <FieldLabel>Introduce yourself</FieldLabel>
          {/* TextArea, not BorderedInput: disables inner scroll so a swipe
              starting on the field still scrolls the form, and shows the
              length counter for the 1000-char limit. */}
          <TextArea
            value={introduction}
            onChangeText={setIntroduction}
            placeholder="Who you are, what you tattoo, why this studio."
            numberOfLines={5}
            maxLength={GS_INTRO_MAX}
            showCounter
            minHeight={110}
          />
        </View>

        <View>
          <FieldLabel>Expected clients (optional)</FieldLabel>
          <BorderedInput
            value={expectedClients}
            onChangeText={setExpectedClients}
            placeholder="E.g. bringing my own bookings, walk-ins welcome."
            maxLength={GS_EXPECTED_CLIENTS_MAX}
          />
        </View>

        <View>
          <FieldLabel>Equipment needs (optional)</FieldLabel>
          <BorderedInput
            value={equipmentNeeds}
            onChangeText={setEquipmentNeeds}
            placeholder="What you bring and what you need on site."
            maxLength={GS_EQUIPMENT_MAX}
          />
        </View>

        {error ? <Text className="text-sm text-danger-fg">{error}</Text> : null}

        <Button
          label={submitting ? "Sending…" : "Send request"}
          onPress={submit}
          loading={submitting}
        />
      </ScrollView>
    </Screen>
  );
}
