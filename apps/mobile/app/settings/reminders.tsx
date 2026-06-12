import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { Minus, Plus } from "lucide-react-native";
import type { LucideIcon } from "@/lib/icon-types";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { IconButton } from "@/components/IconButton";
import { useApiQuery, apiPost } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import type { MobileReminderSettings } from "@inklee/shared/mobile-api";

// Reminder emails — mirrors the web Emails page (settings/reminders form):
// three automated-reminder toggles plus the two day-count fields, persisted to
// profiles.settings.reminder_settings via POST /settings/reminders. The daily
// reminder cron reads these same values, so saving here changes what the server
// sends for both clients. Day fields use +/- steppers (more finger-friendly
// than the web's raw number input) clamped to the same 1-14 / 3-30 ranges.

export default function RemindersSettings() {
  const q = useApiQuery<MobileReminderSettings>("/settings/reminders");
  const themed = useColors();

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load reminder settings"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <RemindersForm initial={q.data} />;
}

function RemindersForm({ initial }: { initial: MobileReminderSettings }) {
  const queryClient = useQueryClient();

  const [depositOverdue, setDepositOverdue] = useState(
    initial.deposit_overdue_enabled,
  );
  const [appointmentEnabled, setAppointmentEnabled] = useState(
    initial.appointment_reminder_enabled,
  );
  const [appointmentDays, setAppointmentDays] = useState(
    initial.appointment_reminder_days,
  );
  const [reconfirmationEnabled, setReconfirmationEnabled] = useState(
    initial.reconfirmation_enabled,
  );
  const [reconfirmationDays, setReconfirmationDays] = useState(
    initial.reconfirmation_days,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Any edit invalidates a stale "Saved." confirmation.
  function edit(apply: () => void) {
    setSaved(false);
    apply();
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiPost<MobileReminderSettings>("/settings/reminders", {
        deposit_overdue_enabled: depositOverdue,
        appointment_reminder_enabled: appointmentEnabled,
        appointment_reminder_days: appointmentDays,
        reconfirmation_enabled: reconfirmationEnabled,
        reconfirmation_days: reconfirmationDays,
      });
      await queryClient.invalidateQueries({
        queryKey: ["api", "/settings/reminders"],
      });
      setSaved(true);
    } catch (e) {
      captureError(e, { op: "saveReminderSettings" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
      >
        <ReminderCard
          title="Deposit overdue reminder"
          description="Sent to the client and to you when a deposit is past due."
          value={depositOverdue}
          onChange={(v) => edit(() => setDepositOverdue(v))}
        />

        <ReminderCard
          title="Appointment reminder"
          description="Sent to the client before their appointment."
          value={appointmentEnabled}
          onChange={(v) => edit(() => setAppointmentEnabled(v))}
        >
          {appointmentEnabled ? (
            <DaysRow
              value={appointmentDays}
              min={1}
              max={14}
              onChange={(v) => edit(() => setAppointmentDays(v))}
            />
          ) : null}
        </ReminderCard>

        <ReminderCard
          title="Reconfirmation request"
          description="Asks the client to confirm they're still coming, with a fresh cancel link."
          value={reconfirmationEnabled}
          onChange={(v) => edit(() => setReconfirmationEnabled(v))}
        >
          {reconfirmationEnabled ? (
            <DaysRow
              value={reconfirmationDays}
              min={3}
              max={30}
              onChange={(v) => edit(() => setReconfirmationDays(v))}
            />
          ) : null}
        </ReminderCard>

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}
        {saved && !error ? (
          <Text className="mb-3 text-sm text-shell-dim">Saved.</Text>
        ) : null}

        <Button label="Save" onPress={save} loading={saving} />
      </ScrollView>
    </Screen>
  );
}

// One reminder toggle card (the books.tsx toggle motif), with an optional
// day-count row slot shown while the toggle is on.
function ReminderCard({
  title,
  description,
  value,
  onChange,
  children,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
  children?: ReactNode;
}) {
  const c = useColors();
  return (
    <View className="mb-4 rounded-2xl border border-shell-border bg-glass p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-base font-semibold text-foreground">
            {title}
          </Text>
          <Text className="mt-0.5 text-sm text-shell-dim">{description}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: "rgba(0,0,0,0.35)", true: c.mustard }}
          thumbColor={c.bone}
          ios_backgroundColor="rgba(0,0,0,0.35)"
        />
      </View>
      {children}
    </View>
  );
}

function DaysRow({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <View className="mt-4 flex-row items-center justify-between border-t border-shell-border pt-4">
      <Text className="flex-1 pr-3 text-sm text-shell-dim">
        Send how many days before?
      </Text>
      <Stepper value={value} min={min} max={max} onChange={onChange} />
    </View>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const c = useColors();
  return (
    <View className="flex-row items-center gap-2">
      <StepButton
        label="Fewer days"
        icon={Minus}
        color={c.bone}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
      />
      <Text className="w-8 text-center text-base font-semibold text-foreground">
        {String(value)}
      </Text>
      <StepButton
        label="More days"
        icon={Plus}
        color={c.bone}
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
      />
    </View>
  );
}

function StepButton({
  label,
  icon,
  color,
  disabled,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  color: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <IconButton
      size="sm"
      outlined
      icon={icon}
      label={label}
      iconSize={16}
      color={color}
      disabled={disabled}
      onPress={onPress}
    />
  );
}
