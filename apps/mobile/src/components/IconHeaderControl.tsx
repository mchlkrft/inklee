import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronDown, MapPin, Slash, X } from "lucide-react-native";
import {
  TRAVEL_ICON_COLORS,
  DEFAULT_ICON_COLOR,
  type TravelIconKey,
} from "@inklee/shared/travel-icons";
import { TravelIcon } from "./TravelIcon";
import { TravelIconPicker } from "./TravelIconPicker";
import { useColors } from "@/lib/theme";

// Re-export the shared default so existing importers (editors, cards) keep
// importing it from this control. One source: @inklee/shared/travel-icons.
export { DEFAULT_ICON_COLOR };

// Header control for the studio/trip editors (ME test 2026-06-18): the icon
// choice lives top-right in the navigation header, not in the form body. The
// button shows the current icon in its chosen color + a chevron; tapping opens a
// bottom sheet to pick the inklee icon AND a color. One control, shared by both
// editors so they can't drift.
export function IconHeaderControl({
  icon,
  iconColor,
  onChange,
}: {
  icon: TravelIconKey | null;
  iconColor: string | null;
  onChange: (next: {
    icon: TravelIconKey | null;
    iconColor: string | null;
  }) => void;
}) {
  const themed = useColors();
  const [open, setOpen] = useState(false);
  const resolved = iconColor ?? DEFAULT_ICON_COLOR;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose icon and color"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className="mr-1 h-9 flex-row items-center gap-1 rounded-full border border-shell-border px-2.5 active:opacity-70"
      >
        <TravelIcon
          icon={icon}
          fallback={MapPin}
          size={22}
          color={icon ? resolved : themed.shell.mute}
        />
        <ChevronDown size={14} color={themed.shell.dim} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/50"
          onPress={() => setOpen(false)}
        >
          {/* Stop propagation so taps inside the sheet don't dismiss it. */}
          <Pressable
            onPress={() => {}}
            className="rounded-t-3xl border-t border-shell-border bg-background px-4 pb-10 pt-4"
          >
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">
                Icon
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                onPress={() => setOpen(false)}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center active:opacity-70"
              >
                <X size={20} color={themed.shell.dim} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 420 }}
            >
              {/* Live preview in the chosen color. */}
              <View className="mb-4 items-center">
                <View className="h-16 w-16 items-center justify-center rounded-2xl bg-bone">
                  <TravelIcon
                    icon={icon}
                    fallback={MapPin}
                    size={40}
                    color={icon ? resolved : DEFAULT_ICON_COLOR}
                  />
                </View>
              </View>

              <TravelIconPicker
                value={icon}
                onChange={(next) => onChange({ icon: next, iconColor })}
              />

              <Text className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-shell-mute">
                Color
              </Text>
              <View className="flex-row flex-wrap gap-3">
                <ColorSwatch
                  color={null}
                  selected={iconColor === null}
                  onPress={() => onChange({ icon, iconColor: null })}
                />
                {TRAVEL_ICON_COLORS.map((c) => (
                  <ColorSwatch
                    key={c}
                    color={c}
                    selected={iconColor === c}
                    onPress={() => onChange({ icon, iconColor: c })}
                  />
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ColorSwatch({
  color,
  selected,
  onPress,
}: {
  color: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const themed = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={color ? `Color ${color}` : "Default color"}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center rounded-full ${
        selected ? "border-2 border-foreground" : "border border-shell-border"
      } active:opacity-70`}
    >
      {color ? (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: color,
          }}
        />
      ) : (
        // Default = no explicit color. Slashed swatch over the default fill.
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: DEFAULT_ICON_COLOR,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Slash size={16} color={themed.shell.bg} />
        </View>
      )}
    </Pressable>
  );
}
