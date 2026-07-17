import { useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import type {
  MobileBookingForm,
  MobileBookingFormField,
  MobileBookingFormOrderUpdate,
  MobileBookingFormSettingsUpdate,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { PillButton } from "@/components/PillButton";
import { ErrorState } from "@/components/ErrorState";
import { SectionLabel } from "@/components/SectionLabel";
import {
  useApiQuery,
  apiPost,
  apiDelete,
  invalidateByPathPrefix,
} from "@/lib/api";
import { config, displayUrl } from "@/lib/config";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { useScreenView } from "@/lib/analytics";

// The native booking-form editor (founder round 7 — editing no longer hands
// off to the web). Mirrors the web unified field list: every standard + custom
// field in the order clients see, visibility switches, required / photo
// annotation sub-toggles, up-down reordering persisted as the full key array,
// and custom-field add / edit / remove via the [fieldId] editor screen.

const FORM_KEY = ["api", "/booking-form"] as const;

// How long after the last reorder tap before the order array persists — one
// write for a multi-step move instead of one per swap.
const ORDER_DEBOUNCE_MS = 600;

function patchForm(
  queryClient: QueryClient,
  patch: (form: MobileBookingForm) => MobileBookingForm,
) {
  queryClient.setQueryData<MobileBookingForm>(FORM_KEY, (cur) =>
    cur ? patch(cur) : cur,
  );
}

function patchField(
  queryClient: QueryClient,
  id: string,
  patch: (f: MobileBookingFormField) => MobileBookingFormField,
) {
  patchForm(queryClient, (form) => ({
    ...form,
    fields: form.fields.map((f) => (f.id === id ? patch(f) : f)),
  }));
}

export default function BookingFormScreen() {
  useScreenView("booking_form");
  const router = useRouter();
  const queryClient = useQueryClient();
  const q = useApiQuery<MobileBookingForm>("/booking-form");
  const themed = useColors();
  const [copied, markCopied] = useTimedFlag();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // All mutations from this screen run one at a time: the show/require/
  // annotation toggles and the order write all read-modify-write the same
  // profiles.settings JSONB server-side, so parallel writes could clobber
  // each other.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const orderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The order the user last arranged, snapshotted at tap time — the debounce
  // posts this, never a re-read of the cache, so a refetch landing inside the
  // settle window can't swap a stale order in just before it persists.
  const orderRef = useRef<string[] | null>(null);

  const enqueue = (request: () => Promise<unknown>) => {
    const next = queueRef.current.then(request, request);
    queueRef.current = next.catch(() => {});
    return next;
  };

  // Optimistic write: the patch is the complete truth for these single-flag
  // mutations, so success needs no refetch; an error invalidates to revert.
  async function runWrite(
    controlId: string,
    patch: () => void,
    request: () => Promise<unknown>,
  ) {
    setPending((p) => new Set(p).add(controlId));
    setError(null);
    await queryClient.cancelQueries({ queryKey: FORM_KEY });
    patch();
    try {
      await enqueue(request);
    } catch (e) {
      captureError(e, { op: "bookingFormWrite", controlId });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      // The revert refetch would clobber any reorder still settling — drop it
      // (the refetch restores the server order visually).
      if (orderTimer.current) {
        clearTimeout(orderTimer.current);
        orderTimer.current = null;
        orderRef.current = null;
      }
      await invalidateByPathPrefix(queryClient, ["/booking-form"]);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(controlId);
        return n;
      });
    }
  }

  // A FormSettings boolean (standard-field show/require + photo annotations).
  function toggleSetting(
    controlId: string,
    key: string,
    value: boolean,
    patch: () => void,
  ) {
    const body: MobileBookingFormSettingsUpdate = { key, value };
    void runWrite(controlId, patch, () =>
      apiPost("/booking-form/settings", body),
    );
  }

  // Custom-field visibility writes the row itself, not form_settings.
  function toggleCustomActive(field: MobileBookingFormField, active: boolean) {
    void runWrite(
      `${field.id}:active`,
      () =>
        patchField(queryClient, field.id, (f) => ({ ...f, enabled: active })),
      () => apiPost(`/booking-form/fields/${field.id}/active`, { active }),
    );
  }

  // Swap with the neighbour, then persist the full displayed key array after a
  // short settle (the web persists the whole list on drop, same payload). The
  // swap runs inside the cache updater keyed by id, so rapid taps before a
  // re-render can't double-apply.
  async function moveField(id: string, dir: -1 | 1) {
    setError(null);
    await queryClient.cancelQueries({ queryKey: FORM_KEY });
    patchForm(queryClient, (form) => {
      const i = form.fields.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= form.fields.length) return form;
      const fields = [...form.fields];
      [fields[i], fields[j]] = [fields[j], fields[i]];
      return { ...form, fields };
    });
    const cur = queryClient.getQueryData<MobileBookingForm>(FORM_KEY);
    if (cur) orderRef.current = cur.fields.map((f) => f.id);
    if (orderTimer.current) clearTimeout(orderTimer.current);
    orderTimer.current = setTimeout(() => {
      orderTimer.current = null;
      const order = orderRef.current;
      if (!order) return;
      const body: MobileBookingFormOrderUpdate = { order };
      enqueue(() => apiPost("/booking-form/order", body)).catch((e) => {
        captureError(e, { op: "bookingFormOrder" });
        setError("Couldn't save the new order. Try again.");
        void invalidateByPathPrefix(queryClient, ["/booking-form"]);
      });
    }, ORDER_DEBOUNCE_MS);
  }

  function confirmRemove(field: MobileBookingFormField) {
    Alert.alert(
      "Remove field",
      `Remove "${field.label}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void runWrite(
              `${field.id}:remove`,
              () =>
                patchForm(queryClient, (form) => ({
                  ...form,
                  fields: form.fields.filter((f) => f.id !== field.id),
                })),
              () => apiDelete(`/booking-form/fields/${field.id}`),
            );
          },
        },
      ],
    );
  }

  const form = q.data;

  if (!form) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
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
    markCopied();
  };

  return (
    <Screen edges={["left", "right"]} column="form">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={themed.accent}
          />
        }
      >
        {publicUrl ? (
          <>
            <SectionLabel>Share public page</SectionLabel>
            <Card>
              <Text className="text-sm text-shell-dim" numberOfLines={1}>
                {displayUrl(publicUrl)}
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
              You&apos;re in fixed-slots mode with no open slots. Add slots
              before sharing.
            </Text>
            <View className="mt-3 flex-row">
              <PillButton
                label="Add slots"
                onPress={() => router.push("/settings/slots/new")}
              />
            </View>
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
                    form.isOpen ? "text-success-fg" : "text-foreground"
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
        <Text className="mb-3 text-sm text-shell-dim">
          Toggle fields on or off, reorder them, and add custom questions. The
          order here is what clients see.
        </Text>
        <Card>
          {form.fields.map((f, i) => (
            <FieldEditRow
              key={f.id}
              field={f}
              divider={i > 0}
              first={i === 0}
              last={i === form.fields.length - 1}
              pending={pending}
              onMove={(dir) => void moveField(f.id, dir)}
              onToggleSetting={toggleSetting}
              onToggleActive={(active) => toggleCustomActive(f, active)}
              onEdit={() => router.push(`/settings/booking-form/${f.id}`)}
              onRemove={() => confirmRemove(f)}
            />
          ))}
        </Card>

        {error ? (
          <Text className="mt-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <View className="mt-4">
          <Button
            label="Add custom field"
            variant="secondary"
            onPress={() => router.push("/settings/booking-form/new")}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

// One editable field row: reorder rail, label + type line, the visibility
// switch (or the always-on note), conditional sub-toggles while visible, and
// the custom-field actions. Mirrors the web unified-field-list row.
function FieldEditRow({
  field,
  divider,
  first,
  last,
  pending,
  onMove,
  onToggleSetting,
  onToggleActive,
  onEdit,
  onRemove,
}: {
  field: MobileBookingFormField;
  divider: boolean;
  first: boolean;
  last: boolean;
  pending: ReadonlySet<string>;
  onMove: (dir: -1 | 1) => void;
  onToggleSetting: (
    controlId: string,
    key: string,
    value: boolean,
    patch: () => void,
  ) => void;
  onToggleActive: (active: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const c = useColors();
  const queryClient = useQueryClient();

  const showId = `${field.id}:show`;
  const requireId = `${field.id}:required`;

  const typeLine =
    field.kind === "standard"
      ? "Standard"
      : `${field.typeLabel ?? "Custom"}${field.required ? " · Required" : ""}`;

  return (
    <View
      className={`py-3 ${divider ? "border-t border-shell-border" : ""} ${
        field.enabled ? "" : "opacity-60"
      }`}
    >
      <View className="flex-row items-center">
        <View className="-ml-1 mr-2">
          <MoveButton
            label={`Move ${field.label} up`}
            edge="top"
            disabled={first}
            onPress={() => onMove(-1)}
          >
            <ChevronUp size={16} color={first ? c.shell.mute : c.shell.dim} />
          </MoveButton>
          <MoveButton
            label={`Move ${field.label} down`}
            edge="bottom"
            disabled={last}
            onPress={() => onMove(1)}
          >
            <ChevronDown size={16} color={last ? c.shell.mute : c.shell.dim} />
          </MoveButton>
        </View>

        <View className="flex-1 pr-3">
          <Text className="text-base text-foreground" numberOfLines={1}>
            {field.label}
          </Text>
          <Text className="mt-0.5 text-xs text-shell-mute">{typeLine}</Text>
        </View>

        {field.alwaysOn ? (
          <Text className="text-sm text-shell-dim">
            {field.lockedRequired ? "Always required" : "Always on"}
          </Text>
        ) : field.kind === "standard" && field.showSettingKey ? (
          <Switch
            value={field.enabled}
            disabled={pending.has(showId)}
            onValueChange={(v) =>
              onToggleSetting(showId, field.showSettingKey!, v, () =>
                patchField(queryClient, field.id, (f) => ({
                  ...f,
                  enabled: v,
                })),
              )
            }
            trackColor={{ false: "rgba(0,0,0,0.35)", true: c.mustard }}
            thumbColor={c.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        ) : (
          <Switch
            value={field.enabled}
            disabled={pending.has(`${field.id}:active`)}
            onValueChange={onToggleActive}
            trackColor={{ false: "rgba(0,0,0,0.35)", true: c.mustard }}
            thumbColor={c.bone}
            ios_backgroundColor="rgba(0,0,0,0.35)"
          />
        )}
      </View>

      {field.enabled && field.requireSettingKey ? (
        <SubToggle
          label="Required"
          value={field.required}
          disabled={pending.has(requireId)}
          onChange={(v) =>
            onToggleSetting(requireId, field.requireSettingKey!, v, () =>
              patchField(queryClient, field.id, (f) => ({
                ...f,
                required: v,
              })),
            )
          }
        />
      ) : null}
      {field.enabled
        ? field.extraToggles.map((t) => (
            <SubToggle
              key={t.key}
              label={t.label}
              value={t.value}
              disabled={pending.has(`${field.id}:${t.key}`)}
              onChange={(v) =>
                onToggleSetting(`${field.id}:${t.key}`, t.key, v, () =>
                  patchForm(queryClient, (form) => ({
                    ...form,
                    allowPhotoAnnotations:
                      t.key === "allow_photo_annotations"
                        ? v
                        : form.allowPhotoAnnotations,
                    fields: form.fields.map((f) =>
                      f.id === field.id
                        ? {
                            ...f,
                            extraToggles: f.extraToggles.map((et) =>
                              et.key === t.key ? { ...et, value: v } : et,
                            ),
                          }
                        : f,
                    ),
                  })),
                )
              }
            />
          ))
        : null}

      {field.kind === "custom" ? (
        <View className="mt-2 flex-row gap-6 pl-9">
          <Pressable onPress={onEdit} hitSlop={8} className="active:opacity-70">
            <Text className="text-label font-medium text-accent">Edit</Text>
          </Pressable>
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            disabled={pending.has(`${field.id}:remove`)}
            className="active:opacity-70"
          >
            <Text className="text-label font-medium text-danger-fg">
              Remove
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// Compact reorder chevron — two stack into a ~63px rail. hitSlop extends each
// target only AWAY from its sibling (top slop on up, bottom slop on down), so
// the two hit rects never overlap and a tap near the seam can't fire the
// wrong direction.
function MoveButton({
  label,
  edge,
  disabled,
  onPress,
  children,
}: {
  label: string;
  edge: "top" | "bottom";
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{
        top: edge === "top" ? 12 : 0,
        bottom: edge === "bottom" ? 12 : 0,
        left: 10,
        right: 6,
      }}
      className="h-9 w-8 items-center justify-center active:opacity-60"
    >
      {children}
    </Pressable>
  );
}

// Indented secondary toggle shown while the field is visible (Required /
// Photo annotations) — the web's conditional sub-switches.
function SubToggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  const c = useColors();
  return (
    <View className="mt-2 flex-row items-center justify-between pl-9">
      <Text className="flex-1 pr-3 text-sm text-shell-dim">{label}</Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: "rgba(0,0,0,0.35)", true: c.mustard }}
        thumbColor={c.bone}
        ios_backgroundColor="rgba(0,0,0,0.35)"
      />
    </View>
  );
}
