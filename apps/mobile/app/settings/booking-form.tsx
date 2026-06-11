import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type {
  MobileBookingForm,
  MobileBookingFormField,
  MobileConnectLink,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { PillButton } from "@/components/PillButton";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost } from "@/lib/api";
import { config } from "@/lib/config";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";
import { useScreenView } from "@/lib/analytics";

// Read-only mirror of the web "My Booking Form" page (/bookings/booking-form):
// share the public link, see availability, and review the configured field
// list in the order clients see it. Editing the fields (toggles, reorder,
// custom questions) stays on the web for now — the footer hands off via the
// authed connect-link pattern (same flow as payouts).

function fieldMeta(f: MobileBookingFormField): string {
  if (!f.enabled) return "Hidden";
  if (f.alwaysOn && f.required) return "Always required";
  if (f.alwaysOn) return "Always on";
  return f.required ? "Required" : "Optional";
}

function FieldRow({
  field,
  divider,
  annotationsOn,
}: {
  field: MobileBookingFormField;
  divider: boolean;
  annotationsOn: boolean;
}) {
  return (
    <View
      className={`flex-row items-center py-3 ${
        divider ? "border-t border-shell-border" : ""
      } ${field.enabled ? "" : "opacity-60"}`}
    >
      <View className="flex-1 pr-3">
        <Text className="text-base text-foreground" numberOfLines={1}>
          {field.label}
        </Text>
        <Text className="mt-0.5 text-xs text-shell-mute">
          {field.kind === "standard"
            ? "Standard"
            : (field.typeLabel ?? "Custom")}
          {annotationsOn ? " · Photo annotations on" : ""}
        </Text>
      </View>
      <Text className="text-sm text-shell-dim">{fieldMeta(field)}</Text>
    </View>
  );
}

export default function BookingFormScreen() {
  useScreenView("booking_form");
  const router = useRouter();
  const queryClient = useQueryClient();
  const q = useApiQuery<MobileBookingForm>("/booking-form");
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = q.data;

  if (!form) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.mustard} />
          ) : (
            <ErrorState
              title="Couldn't load your booking form"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  const publicUrl = form.slug ? config.publicUrl(form.slug) : null;

  const copy = async () => {
    if (!publicUrl) return;
    await Clipboard.setStringAsync(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Field editing stays on the web: mint a one-time login link and open the
  // web form editor in an in-app browser (the payouts connect-link pattern).
  // Refresh the summary on return in case fields changed.
  const editOnWeb = async () => {
    setOpening(true);
    setError(null);
    try {
      const { url } = await apiPost<MobileConnectLink>(
        "/settings/connect-link",
        { next: "/bookings/booking-form" },
      );
      await WebBrowser.openBrowserAsync(url);
      await queryClient.invalidateQueries({
        queryKey: ["api", "/booking-form"],
      });
    } catch (e) {
      captureError(e, { op: "openBookingFormWeb" });
      setError("Couldn't open the web editor. Try again.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={colors.mustard}
          />
        }
      >
        {publicUrl ? (
          <>
            <SectionLabel>Share public page</SectionLabel>
            <Card>
              <Text className="text-sm text-shell-dim" numberOfLines={1}>
                {publicUrl.replace(/^https?:\/\//, "")}
              </Text>
              <View className="mt-2.5 flex-row gap-2">
                <PillButton
                  label={copied ? "Copied" : "Copy link"}
                  onPress={copy}
                />
                <PillButton
                  label="Preview"
                  onPress={() => {
                    void WebBrowser.openBrowserAsync(publicUrl);
                  }}
                />
              </View>
            </Card>
          </>
        ) : null}

        {form.isFixedSlotsWithoutSlots ? (
          <View className="mt-4 rounded-card border-brand border-mustard/40 bg-mustard/10 p-4">
            <Text className="text-sm font-semibold text-foreground">
              Your booking link will appear closed until you post slots
            </Text>
            <Text className="mt-1 text-xs text-foreground">
              You&apos;re in fixed-slots mode with no open slots. Add slots on
              the web before sharing.
            </Text>
          </View>
        ) : null}

        <SectionLabel>Availability</SectionLabel>
        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center gap-2">
                <View
                  className={`h-2 w-2 rounded-full ${
                    form.isOpen ? "bg-success" : "bg-shell-mute"
                  }`}
                />
                <Text
                  className={`text-base font-semibold ${
                    form.isOpen ? "text-success" : "text-foreground"
                  }`}
                >
                  {form.isOpen ? "Open" : "Closed"}
                </Text>
              </View>
              <Text className="mt-0.5 text-sm text-shell-dim">
                {form.isOpen
                  ? "Currently accepting requests"
                  : "Closed to new requests"}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push("/settings/books")}
              hitSlop={8}
              className="active:opacity-70"
            >
              <Text className="text-label font-medium text-accent">Edit</Text>
            </Pressable>
          </View>
        </Card>

        <SectionLabel>Form fields</SectionLabel>
        <Card>
          {form.fields.map((f, i) => (
            <FieldRow
              key={f.id}
              field={f}
              divider={i > 0}
              annotationsOn={
                f.id === "image_upload" &&
                f.enabled &&
                form.allowPhotoAnnotations
              }
            />
          ))}
        </Card>

        <Text className="mt-4 text-xs leading-relaxed text-shell-mute">
          This is what clients see on your public form, in this order. To
          toggle fields, reorder them, or add custom questions, edit your form
          on the web.
        </Text>
        {error ? (
          <Text className="mt-2 text-sm text-danger">{error}</Text>
        ) : null}
        <View className="mt-3">
          <Button
            label="Edit form on the web"
            variant="secondary"
            onPress={editOnWeb}
            loading={opening}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-shell-mute">
      {children}
    </Text>
  );
}
