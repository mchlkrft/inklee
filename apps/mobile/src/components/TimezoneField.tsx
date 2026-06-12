import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CURATED_TIMEZONES } from "@inklee/shared/timezone";
import { border, radius } from "@/lib/tokens";
import { useColors } from "@/lib/theme";

// Curated timezone picker — a pressable field opening a bottom-sheet list of
// the shared curated zones (the same list behind the web profile form's
// <select>; packages/shared/src/timezone.ts). An arbitrary IANA value set
// through another path (e.g. the device-timezone shortcut) is surfaced at the
// top of the list so the current selection always shows. Same Modal sheet
// pattern as AccountMenuSheet.
export function TimezoneField({
  value,
  onChange,
  deviceTz,
}: {
  value: string;
  onChange: (tz: string) => void;
  deviceTz: string | null;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const options = useMemo(() => {
    const curated: string[] = [...CURATED_TIMEZONES];
    return value && !curated.includes(value) ? [value, ...curated] : curated;
  }, [value]);

  const canUseDeviceTz = !!deviceTz && deviceTz !== value;

  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-sm font-medium text-foreground">
        Timezone
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose a timezone"
        onPress={() => setOpen(true)}
        className="h-12 flex-row items-center rounded-xl border-brand border-shell-border px-4 active:opacity-70"
      >
        <Text
          className={`flex-1 text-base ${value ? "text-foreground" : "text-shell-mute"}`}
        >
          {value || "Choose a timezone"}
        </Text>
        <Ionicons name="chevron-down" size={16} color={c.shell.mute} />
      </Pressable>
      {canUseDeviceTz ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(deviceTz!)}
          className="mt-2 active:opacity-70"
        >
          <Text className="text-sm text-accent">
            Use this device&apos;s timezone ({deviceTz})
          </Text>
        </Pressable>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          accessibilityLabel="Close timezone picker"
          onPress={() => setOpen(false)}
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          {/* Stop taps inside the sheet from closing it. */}
          <Pressable
            onPress={() => {}}
            className="px-5 pt-5"
            style={{
              maxHeight: "70%",
              backgroundColor: c.shell.bg,
              borderTopWidth: border.brand,
              borderColor: c.shell.border,
              borderTopLeftRadius: radius.card,
              borderTopRightRadius: radius.card,
              paddingBottom: insets.bottom + 16,
            }}
          >
            <Text className="mb-2 text-sm font-semibold text-foreground">
              Timezone
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {options.map((tz) => {
                const selected = tz === value;
                return (
                  <Pressable
                    key={tz}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onChange(tz);
                      setOpen(false);
                    }}
                    className="flex-row items-center justify-between py-3 active:opacity-60"
                  >
                    <Text
                      className={`text-base ${
                        selected
                          ? "font-semibold text-accent"
                          : "text-foreground"
                      }`}
                    >
                      {tz.replace(/_/g, " ")}
                    </Text>
                    {selected ? (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={c.accent}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
