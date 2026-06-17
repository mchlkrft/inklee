import { Pressable, View } from "react-native";
import { MapPin, Slash } from "lucide-react-native";
import {
  TRAVEL_ICON_KEYS,
  type TravelIconKey,
} from "@inklee/shared/travel-icons";
import { TravelIcon } from "./TravelIcon";
import { colors } from "@/lib/tokens";
import { useColors } from "@/lib/theme";

// Icon grid for trips + studios — a wrap-row of tappable chips over the
// founder's custom inklee tattoo-badge icons, led by a slashed "no icon" chip.
// Keys come from the shared library, so the web picker shows the same set.
// Detailed line art, so the chips run a touch larger than a glyph chip.
export function TravelIconPicker({
  value,
  onChange,
}: {
  value: TravelIconKey | null;
  onChange: (next: TravelIconKey | null) => void;
}) {
  const themed = useColors();
  return (
    <View className="mb-3 flex-row flex-wrap gap-2">
      <IconOption
        label="No icon"
        selected={value === null}
        onPress={() => onChange(null)}
      >
        <Slash
          size={18}
          color={value === null ? colors.charcoal : themed.shell.mute}
        />
      </IconOption>
      {TRAVEL_ICON_KEYS.map((key) => {
        const selected = value === key;
        return (
          <IconOption
            key={key}
            label={`Icon: ${key}`}
            selected={selected}
            onPress={() => onChange(key)}
          >
            <TravelIcon
              icon={key}
              fallback={MapPin}
              size={30}
              color={selected ? colors.charcoal : themed.shell.dim}
            />
          </IconOption>
        );
      })}
    </View>
  );
}

function IconOption({
  label,
  selected,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-14 w-14 items-center justify-center rounded-xl ${
        selected ? "bg-mustard" : "bg-shell-hover"
      } active:opacity-80`}
    >
      {children}
    </Pressable>
  );
}
