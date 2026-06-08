import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError, apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Apple 5.1.1(v) in-app account deletion. Deliberate full-screen flow with a
// type-to-confirm gate. On success the auth session is cleared and the auth gate
// routes back to sign-in automatically. A 409 (unresolved money) shows an
// explainer and does NOT delete. (Re-auth before delete is a documented v2
// hardening; today the valid Bearer session + type-to-confirm gate it.)
export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onDelete() {
    setError(null);
    setBlocked(null);
    setPending(true);
    try {
      await apiDelete("/account", { confirm: "DELETE" });
      // Account is gone — clearing the session flips the auth gate to sign-in.
      await signOut();
    } catch (e) {
      if (e instanceof ApiError && e.code === "money_not_resolved") {
        setBlocked(e.message);
      } else {
        setError(
          e instanceof Error ? e.message : "Couldn't delete your account.",
        );
      }
      setPending(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-charcoal"
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-xl font-bold text-bone">Delete your account</Text>
      <Text className="mt-3 text-sm text-shell-dim">
        This permanently deletes your Inklee account — your booking history,
        client data, uploaded photos, and your public page. This cannot be
        undone.
      </Text>
      <Text className="mt-3 text-sm text-shell-dim">
        You can&apos;t delete while you have unresolved paid deposits or a
        pending Stripe balance — resolve those first.
      </Text>

      {blocked ? (
        <View className="mt-4 rounded-xl border border-mustard/50 bg-mustard/10 p-3">
          <Text className="text-sm text-bone">{blocked}</Text>
        </View>
      ) : null}

      <Text className="mb-2 mt-6 text-xs uppercase tracking-wide text-shell-mute">
        Type DELETE to confirm
      </Text>
      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="DELETE"
        placeholderTextColor="rgba(229,225,213,0.32)"
        accessibilityLabel="Type DELETE to confirm account deletion"
        className="h-12 rounded-xl border border-shell-border px-4 text-bone"
      />

      {error ? (
        <Text className="mt-3 text-sm text-danger">{error}</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={pending || confirm !== "DELETE"}
        onPress={onDelete}
        className={`mt-6 h-12 items-center justify-center rounded-xl bg-danger ${
          pending || confirm !== "DELETE" ? "opacity-50" : "active:opacity-80"
        }`}
      >
        {pending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-semibold text-white">
            Delete account
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
