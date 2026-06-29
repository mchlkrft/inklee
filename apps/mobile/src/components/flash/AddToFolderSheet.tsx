import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";
import { themeVars, useColors, useThemePreference } from "@/lib/theme";

// Bottom sheet listing every folder (plus Unfiled), opened by long-pressing a
// flash design in the library (ME test 2026-06-18). Selecting a row moves the
// design into that folder. The drag-into-folder gesture writes the same way.
export function AddToFolderSheet({
  visible,
  designTitle,
  folders,
  currentFolderId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  designTitle: string;
  folders: { id: string; name: string }[];
  currentFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const themed = useColors();
  const { scheme } = useThemePreference();
  const options: { id: string | null; name: string }[] = [
    { id: null, name: "Unfiled" },
    ...folders.map((f) => ({ id: f.id, name: f.name })),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Re-apply theme vars: a RN Modal portals outside the ThemeProvider, so
          without this the className `var(--…)` tokens fall back to the dark
          :root and the sheet renders dark even in light mode. */}
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
              Add to folder
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
          <Text className="mb-3 text-sm text-shell-dim" numberOfLines={1}>
            {designTitle}
          </Text>
          <ScrollView
            style={{ maxHeight: 360 }}
            showsVerticalScrollIndicator={false}
          >
            {options.map((o) => {
              const selected = (o.id ?? null) === currentFolderId;
              return (
                <Pressable
                  key={o.id ?? "unfiled"}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(o.id)}
                  className="flex-row items-center justify-between rounded-xl px-3 py-3 active:opacity-70"
                >
                  <Text
                    className={`text-base ${
                      selected
                        ? "font-semibold text-foreground"
                        : "text-shell-dim"
                    }`}
                  >
                    {o.name}
                  </Text>
                  {selected ? (
                    <Check size={18} color={themed.accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
