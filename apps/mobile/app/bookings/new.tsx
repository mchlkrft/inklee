import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { SIZES, SIZE_LABELS } from "@inklee/shared/booking-schema";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { TextArea } from "@/components/TextArea";
import { DateField } from "@/components/DateField";
import { RadioList } from "@/components/RadioList";
import { Button } from "@/components/Button";
import { apiPatch, apiPost, invalidateBookingViews, useApiQuery } from "@/lib/api";
import { type BookingDetail } from "@/lib/bookings";
import { useColors } from "@/lib/theme";
import { captureError } from "@/lib/telemetry";
import { useScreenView } from "@/lib/analytics";

// Sizes sourced from the shared booking-schema so labels stay in sync with the
// web. "Label - hint" (hyphen, not em-dash, per the copy rule).
const SIZE_OPTIONS: { value: string; label: string }[] = SIZES.map((s) => ({
  value: s,
  label: `${SIZE_LABELS[s].label} - ${SIZE_LABELS[s].hint}`,
}));

function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

// Create OR edit an appointment (mirrors the web New Appointment modal +
// appointment-drawer edit). `id` param => edit mode (PATCH); otherwise create
// (POST), pre-filled with the calendar's selected day when provided.
export default function AppointmentFormScreen() {
  const params = useLocalSearchParams<{ date?: string; id?: string }>();
  const isEdit = !!params.id;
  useScreenView(isEdit ? "appointment_edit" : "appointment_new");
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useColors();
  const queryClient = useQueryClient();

  const detailQ = useApiQuery<BookingDetail>(`/bookings/${params.id}`, {
    enabled: isEdit,
  });

  const [handle, setHandle] = useState("");
  const [date, setDate] = useState<string | null>(params.date ?? null);
  const [placement, setPlacement] = useState("");
  const [size, setSize] = useState("");
  const [description, setDescription] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: isEdit ? "Edit appointment" : "New appointment",
    });
  }, [navigation, isEdit]);

  // Prefill once from the booking detail in edit mode.
  useEffect(() => {
    if (isEdit && detailQ.data && !prefilled) {
      const d = detailQ.data;
      setHandle(d.handle ?? "");
      setDate(d.preferredDate);
      setPlacement(d.placement ?? "");
      setSize(d.sizeRaw ?? "");
      setDescription(d.description ?? "");
      setEmail(d.email ?? "");
      setPrefilled(true);
    }
  }, [isEdit, detailQ.data, prefilled]);

  async function submit() {
    if (!handle.trim()) return setError("Instagram handle is required.");
    if (!date) return setError("Date is required.");
    if (!placement.trim()) return setError("Placement is required.");
    if (!size) return setError("Size is required.");
    if (!isEdit && sendEmail && !email.trim()) {
      return setError("Add an email to send a confirmation.");
    }
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        await apiPatch(`/bookings/${params.id}`, {
          handle: handle.trim(),
          date,
          placement: placement.trim(),
          size,
          description: description.trim(),
          email: email.trim() || null,
        });
      } else {
        await apiPost("/calendar/appointments", {
          handle: handle.trim(),
          date,
          placement: placement.trim(),
          size,
          description: description.trim(),
          email: sendEmail ? email.trim() : null,
          sendEmail,
        });
      }
      await invalidateBookingViews(queryClient);
      router.back();
    } catch (e) {
      captureError(e, { op: isEdit ? "editAppointment" : "createAppointment" });
      setError(e instanceof Error ? e.message : "Couldn't save the appointment.");
      setSubmitting(false);
    }
  }

  if (isEdit && !detailQ.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Text className="mb-1.5 text-sm font-medium text-foreground">
          Instagram handle
        </Text>
        <View className="mb-3 h-12 flex-row items-center rounded-xl border-brand border-shell-border px-4">
          <Text className="mr-1 text-shell-dim">@</Text>
          <TextInput
            value={handle}
            onChangeText={setHandle}
            placeholder="username"
            placeholderTextColor={colors.shell.mute}
            autoCapitalize="none"
            autoComplete="off"
            className="h-full flex-1 text-base text-foreground"
          />
        </View>

        <DateField
          label="Date"
          value={date}
          onChange={setDate}
          minimumDate={isEdit ? undefined : tomorrow()}
        />

        <TextField
          label="Placement"
          value={placement}
          onChangeText={setPlacement}
          placeholder="Left forearm, inner wrist..."
        />

        <Text className="mb-1.5 text-sm font-medium text-foreground">Size</Text>
        <RadioList options={SIZE_OPTIONS} value={size} onChange={setSize} />

        <TextArea
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          minHeight={80}
        />

        {isEdit ? (
          <TextField
            label="Customer email (optional)"
            value={email}
            onChangeText={setEmail}
            placeholder="client@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        ) : (
          <>
            <View className="mb-3 mt-1 flex-row items-center justify-between">
              <Text className="flex-1 pr-3 text-base text-foreground">
                Send confirmation email to customer
              </Text>
              <Switch
                value={sendEmail}
                onValueChange={setSendEmail}
                trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
                thumbColor={colors.bone}
                ios_backgroundColor="rgba(0,0,0,0.35)"
              />
            </View>
            {sendEmail ? (
              <TextField
                label="Customer email"
                value={email}
                onChangeText={setEmail}
                placeholder="client@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : null}
          </>
        )}

        {error ? (
          <Text className="mb-2 text-xs text-danger-fg">{error}</Text>
        ) : null}

        <View className="mt-2">
          <Button
            label={isEdit ? "Save changes" : "Create appointment"}
            onPress={submit}
            loading={submitting}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
