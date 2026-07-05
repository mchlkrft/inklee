import { Modal, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { X } from "lucide-react-native";
import { themeVars, useColors, useThemePreference } from "@/lib/theme";

// The New design fork (web parity): start a blank draft, or import from
// Instagram. Opened from the flash library "New design" button.
export function NewDesignSheet({
  visible,
  onClose,
  onBlank,
  onImport,
}: {
  visible: boolean;
  onClose: () => void;
  onBlank: () => void;
  onImport: () => void;
}) {
  const themed = useColors();
  const { scheme } = useThemePreference();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Re-apply theme vars: a RN Modal portals outside the ThemeProvider. */}
      <Pressable
        style={themeVars[scheme]}
        className="flex-1 justify-end bg-black/50"
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          className="rounded-t-3xl border-t border-shell-border bg-background px-4 pb-10 pt-4"
        >
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-foreground">
              New design
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              className="h-8 w-8 items-center justify-center active:opacity-70"
            >
              <X size={20} color={themed.shell.dim} />
            </Pressable>
          </View>

          <OptionRow
            icon="add-circle-outline"
            title="Blank design"
            subtitle="Start from a photo and details."
            accent={themed.accent}
            dim={themed.shell.dim}
            onPress={onBlank}
          />
          <OptionRow
            icon="logo-instagram"
            title="Import from Instagram"
            subtitle="Turn your posts into designs."
            accent={themed.accent}
            dim={themed.shell.dim}
            onPress={onImport}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OptionRow({
  icon,
  title,
  subtitle,
  accent,
  dim,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  accent: string;
  dim: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="mt-2 flex-row items-center gap-3 rounded-2xl border border-shell-border bg-glass p-4 active:opacity-80"
    >
      <Ionicons name={icon} size={22} color={accent} />
      <View className="flex-1">
        <Text className="text-base font-semibold text-foreground">{title}</Text>
        <Text className="mt-0.5 text-sm text-shell-dim">{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={dim} />
    </Pressable>
  );
}
