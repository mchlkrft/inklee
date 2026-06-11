import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/Card";
import { apiPost } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { colors } from "@/lib/tokens";
import type { MobileHome } from "@inklee/shared/mobile-api";

const HOME_KEY = ["api", "/home"];

// The artist's open/closed control. Optimistically patches the /home cache (the
// source of booksOpen) so the switch flips instantly, then reconciles; reverts
// on failure.
export function BooksToggle({ open }: { open: boolean }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchHome(next: boolean) {
    queryClient.setQueryData<MobileHome>(HOME_KEY, (old) =>
      old ? { ...old, booksOpen: next } : old,
    );
  }

  async function toggle(next: boolean) {
    setPending(true);
    setError(null);
    patchHome(next);
    try {
      await apiPost("/settings/books", { open: next });
      // Reconcile with the server's *effective* state (e.g. an expired booking
      // window keeps books closed even when the flag flips).
      void queryClient.invalidateQueries({ queryKey: HOME_KEY });
    } catch (e) {
      captureError(e, { op: "toggleBooks" });
      patchHome(!next); // clean single revert (no refetch needed)
      setError("Couldn't update. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-base font-semibold text-foreground">
            Booking status
          </Text>
          <Text className="mt-0.5 text-sm text-shell-dim">
            {open
              ? "Open — accepting requests"
              : "Closed — not accepting requests"}
          </Text>
          {error ? (
            <Text className="mt-1 text-xs text-danger">{error}</Text>
          ) : null}
        </View>
        <Switch
          value={open}
          onValueChange={toggle}
          disabled={pending}
          accessibilityLabel="Booking status"
          trackColor={{ false: "rgba(0,0,0,0.35)", true: colors.mustard }}
          thumbColor={colors.bone}
          ios_backgroundColor="rgba(0,0,0,0.35)"
        />
      </View>
    </Card>
  );
}
