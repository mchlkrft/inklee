import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ChevronDown, MapPin, Slash, X } from "lucide-react-native";
import {
  TRAVEL_ICON_COLORS,
  TRAVEL_ICON_BG_COLORS,
  DEFAULT_ICON_BG,
  DEFAULT_TRIP_ICON_COLOR,
  DEFAULT_STUDIO_ICON_COLOR,
  type TravelIconKey,
} from "@inklee/shared/travel-icons";
import { TravelIcon } from "./TravelIcon";
import { TravelIconPicker } from "./TravelIconPicker";
import { AdaptiveSheet } from "./AdaptiveSheet";
import { useColors } from "@/lib/theme";

// Header control for the studio/trip editors (ME test 2026-06-18): the icon
// choice lives top-right in the navigation header, not in the form body. The
// button shows the current icon on its chosen tile background + a chevron;
// tapping opens a bottom sheet to pick the inklee icon, a color AND a tile
// background. One control, shared by both editors so they can't drift. `kind`
// sets the defaults the null choices preview: trips mark charcoal on bone,
// studios mark red on bone.
export function IconHeaderControl({
  kind,
  icon,
  iconColor,
  iconBg,
  onChange,
}: {
  kind: "trip" | "studio";
  icon: TravelIconKey | null;
  iconColor: string | null;
  iconBg: string | null;
  onChange: (next: {
    icon: TravelIconKey | null;
    iconColor: string | null;
    iconBg: string | null;
  }) => void;
}) {
  const themed = useColors();
  const [open, setOpen] = useState(false);
  const defaultColor =
    kind === "studio" ? DEFAULT_STUDIO_ICON_COLOR : DEFAULT_TRIP_ICON_COLOR;
  const resolved = iconColor ?? defaultColor;
  const resolvedBg = iconBg ?? DEFAULT_ICON_BG;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose icon, color and background"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className="mr-1 h-9 flex-row items-center gap-1 rounded-full border border-shell-border px-1.5 active:opacity-70"
      >
        {/* Mini tile previews the chosen background; the chevron stays on the
            header surface so it keeps theme contrast. */}
        <View
          className="h-6 w-6 items-center justify-center rounded-md"
          style={{ backgroundColor: resolvedBg }}
        >
          <TravelIcon
            icon={icon}
            fallback={MapPin}
            size={18}
            color={icon ? resolved : themed.shell.mute}
          />
        </View>
        <ChevronDown size={14} color={themed.shell.dim} />
      </Pressable>

      <AdaptiveSheet visible={open} onClose={() => setOpen(false)}>
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
              style={{ maxHeight: 460 }}
            >
              {/* Live preview: chosen mark in the chosen color on the chosen
                  tile background. */}
              <View className="mb-4 items-center">
                <View
                  className="h-16 w-16 items-center justify-center rounded-2xl border border-shell-border"
                  style={{ backgroundColor: resolvedBg }}
                >
                  <TravelIcon
                    icon={icon}
                    fallback={MapPin}
                    size={40}
                    color={icon ? resolved : defaultColor}
                  />
                </View>
              </View>

              <TravelIconPicker
                value={icon}
                onChange={(next) => onChange({ icon: next, iconColor, iconBg })}
              />

              <Text className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-shell-mute">
                Color
              </Text>
              <View className="flex-row flex-wrap gap-3">
                <ColorSwatch
                  color={null}
                  defaultFill={defaultColor}
                  label="Default color"
                  selected={iconColor === null}
                  onPress={() => onChange({ icon, iconColor: null, iconBg })}
                />
                {TRAVEL_ICON_COLORS.map((c) => (
                  <ColorSwatch
                    key={c}
                    color={c}
                    defaultFill={defaultColor}
                    label={`Color ${c}`}
                    selected={iconColor === c}
                    onPress={() => onChange({ icon, iconColor: c, iconBg })}
                  />
                ))}
              </View>

              <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-shell-mute">
                Background
              </Text>
              <View className="flex-row flex-wrap gap-3">
                <ColorSwatch
                  color={null}
                  defaultFill={DEFAULT_ICON_BG}
                  label="Default background"
                  selected={iconBg === null}
                  onPress={() => onChange({ icon, iconColor, iconBg: null })}
                />
                {TRAVEL_ICON_BG_COLORS.map((c) => (
                  <ColorSwatch
                    key={c}
                    color={c}
                    defaultFill={DEFAULT_ICON_BG}
                    label={`Background ${c}`}
                    selected={iconBg === c}
                    onPress={() => onChange({ icon, iconColor, iconBg: c })}
                  />
                ))}
              </View>
            </ScrollView>
      </AdaptiveSheet>
    </>
  );
}

function ColorSwatch({
  color,
  defaultFill,
  label,
  selected,
  onPress,
}: {
  color: string | null;
  /** Fill of the "default" (null) chip — what the cleared choice resolves to. */
  defaultFill: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
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
        // Default = no explicit choice. Slashed swatch over the default fill;
        // the slash contrasts with the fill (dark mark on bone, bone on dark).
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: defaultFill,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Slash
            size={16}
            color={
              defaultFill === DEFAULT_ICON_BG
                ? DEFAULT_TRIP_ICON_COLOR
                : DEFAULT_ICON_BG
            }
          />
        </View>
      )}
    </Pressable>
  );
}
