import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { AdaptiveSheet } from "@/components/AdaptiveSheet";
import { useColors } from "@/lib/theme";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { DangerButton } from "@/components/DangerButton";
import { apiPatch, apiDelete } from "@/lib/api";
import { captureError } from "@/lib/telemetry";

// Rename or delete a flash folder, opened by long-pressing a real folder chip
// in the library. Wires the PATCH/DELETE /flash/folders/[id] routes. Deleting a
// folder unfiles its designs (the FK is ON DELETE SET NULL server-side).
export function ManageFolderSheet({
  folder,
  onClose,
  onSaved,
  onDeleted,
}: {
  folder: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const themed = useColors();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reseed the field whenever a different folder opens the sheet. Safe against
  // clobbering edits: the sheet closes (folder -> null) on save, so the name
  // prop never changes mid-edit.
  useEffect(() => {
    setName(folder?.name ?? "");
    setError(null);
  }, [folder?.id, folder?.name]);

  async function rename() {
    if (!folder) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Folder name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPatch(`/flash/folders/${folder.id}`, { name: trimmed });
      onSaved();
      onClose();
    } catch (e) {
      captureError(e, { op: "renameFlashFolder" });
      setError(e instanceof Error ? e.message : "Couldn't rename. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!folder) return;
    Alert.alert(
      "Delete this folder?",
      "The designs inside stay and become unfiled. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!folder) return;
            setBusy(true);
            setError(null);
            try {
              await apiDelete(`/flash/folders/${folder.id}`);
              onDeleted();
              onClose();
            } catch (e) {
              captureError(e, { op: "deleteFlashFolder" });
              setError(
                e instanceof Error ? e.message : "Couldn't delete. Try again.",
              );
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <AdaptiveSheet visible={folder !== null} onClose={onClose} avoidKeyboard>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-foreground">
              Manage folder
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

          <TextField
            label="Folder name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="e.g. Neo-trad"
          />

          {error ? (
            <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
          ) : null}

          <Button
            label="Save"
            onPress={rename}
            loading={saving}
            disabled={!name.trim() || busy}
          />
          <DangerButton
            label="Delete folder"
            onPress={confirmDelete}
            disabled={saving || busy}
          />
    </AdaptiveSheet>
  );
}
