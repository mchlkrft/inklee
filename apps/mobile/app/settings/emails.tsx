import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Minus, Plus } from "lucide-react-native";
import type { LucideIcon } from "@/lib/icon-types";
import { useQueryClient } from "@tanstack/react-query";
import type {
  MobileEmailTemplatesResponse,
  MobileReminderSettings,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/ErrorState";
import { IconButton } from "@/components/IconButton";
import { SectionLabel } from "@/components/SectionLabel";
import { useApiQuery, apiPost } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useScreenView } from "@/lib/analytics";
import { useColors } from "@/lib/theme";

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

// Emails settings — ONE page, two sections (founder round 7, mirroring the
// web /settings/emails page layout): the five per-status booking email
// templates, then the automated-reminder settings that used to live on their
// own screen. Tapping a template row opens the native editor; the reminders
// section saves independently.
export default function EmailsScreen() {
  useScreenView("settings_emails");
  const router = useRouter();
  const themed = useColors();
  const q = useApiQuery<MobileEmailTemplatesResponse>(
    "/settings/email-templates",
  );

  // No page-level gate: the two sections load independently, so a failed
  // templates fetch never locks the artist out of the reminder settings.
  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={themed.accent}
          />
        }
      >
        <SectionLabel>Booking emails</SectionLabel>
        <Text className="mb-3 text-sm text-shell-dim">
          Customize the emails sent for each booking status. Tap a template to
          edit its content.
        </Text>

        {!q.data ? (
          q.loading ? (
            <View className="items-center py-8">
              <ActivityIndicator color={themed.accent} />
            </View>
          ) : (
            <ErrorState
              title="Couldn't load email templates"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )
        ) : (
          <Card>
            {q.data.items.map((tpl, i) => (
              <Pressable
                key={tpl.type}
                accessibilityRole="button"
                onPress={() =>
                  router.push(`/settings/email-templates/${tpl.type}`)
                }
                className={`flex-row items-center justify-between py-3 active:opacity-70 ${
                  i > 0 ? "border-t border-shell-border" : ""
                }`}
              >
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="shrink text-base text-foreground"
                      numberOfLines={1}
                    >
                      {tpl.label}
                    </Text>
                    {tpl.edited ? (
                      <View className="rounded-full border border-shell-border px-1.5 py-0.5">
                        <Text className="text-[10px] text-shell-dim">
                          Edited
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    className="mt-0.5 text-xs text-shell-dim"
                    style={{ fontFamily: MONO }}
                    numberOfLines={1}
                  >
                    {tpl.subject}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Text
                    className={`text-sm ${
                      tpl.enabled ? "text-foreground" : "text-shell-mute"
                    }`}
                  >
                    {tpl.enabled ? "On" : "Off"}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={themed.shell.mute}
                  />
                </View>
              </Pressable>
            ))}
          </Card>
        )}

        <SectionLabel>Automated reminders</SectionLabel>
        <RemindersSection />
      </ScrollView>
    </Screen>
  );
}

// The automated-reminder settings (was its own screen until founder round 7):
// three toggles plus two day-count steppers, persisted to
// profiles.settings.reminder_settings via POST /settings/reminders. The daily
// reminder cron reads these same values. Loads and saves independently of the
// template list above.
function RemindersSection() {
  const q = useApiQuery<MobileReminderSettings>("/settings/reminders");
  const themed = useColors();

  if (!q.data) {
    return q.loading ? (
      <View className="items-center py-8">
        <ActivityIndicator color={themed.accent} />
      </View>
    ) : (
      <ErrorState
        title="Couldn't load reminder settings"
        subtitle={q.error ?? undefined}
        onRetry={q.refresh}
      />
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
    <View>
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

      <Button label="Save reminders" onPress={save} loading={saving} />
    </View>
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
