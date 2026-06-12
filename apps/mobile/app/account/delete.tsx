import { useRef, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { captureError } from "@/lib/telemetry";
import { Button } from "@/components/Button";
import { useColors } from "@/lib/theme";

// Apple 5.1.1(v) + counsel §9 in-app account deletion. A deliberate full-screen
// flow that requires BOTH re-authentication (re-enter password / re-complete
// Sign in with Apple/Google — refreshes the session right before the irreversible
// op) AND a type-to-confirm gate. Per counsel §3 the server never blocks on
// financial state; on success the session is cleared and the auth gate routes
// back to sign-in.
export default function DeleteAccountScreen() {
  const themed = useColors();
  const {
    session,
    signInWithPassword,
    signInWithApple,
    signInWithGoogle,
    signOut,
  } = useAuth();
  const provider = session?.user?.app_metadata?.provider ?? "email";
  const email = session?.user?.email ?? "";
  // Pin the account-to-delete at mount. Re-auth (esp. the Apple/Google sheet)
  // SWAPS the active session, so we compare the post-re-auth user id against this
  // to refuse deleting a *different* account than the one shown (shared device).
  const accountToDeleteId = useRef(session?.user?.id ?? null);

  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [reauthed, setReauthed] = useState(false);
  const [reauthPending, setReauthPending] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function reauth(fn: () => Promise<void>) {
    setReauthError(null);
    setReauthPending(true);
    try {
      await fn();
      // Re-auth may have swapped the session — confirm it's still the SAME
      // account we're about to delete, never a different one signed in just now.
      const { data: fresh } = await supabase.auth.getSession();
      const freshId = fresh.session?.user?.id ?? null;
      if (
        accountToDeleteId.current &&
        freshId &&
        freshId !== accountToDeleteId.current
      ) {
        setReauthError(
          "That was a different account. Sign in as the account you want to delete.",
        );
        return;
      }
      setReauthed(true);
    } catch (e) {
      // The user cancelling the Apple/Google sheet isn't an error.
      if (
        e instanceof Error &&
        "code" in e &&
        (e as { code?: string }).code === "ERR_REQUEST_CANCELED"
      ) {
        return;
      }
      setReauthError(
        provider === "email"
          ? "Incorrect password. Try again."
          : "Couldn't confirm your identity. Try again.",
      );
    } finally {
      setReauthPending(false);
    }
  }

  async function onDelete() {
    setError(null);
    setPending(true);
    try {
      await apiDelete("/account", { confirm: "DELETE" });
      // Account is gone — clearing the session flips the auth gate to sign-in.
      await signOut();
    } catch (e) {
      captureError(e, { op: "deleteAccount" });
      setError(
        e instanceof Error ? e.message : "Couldn't delete your account.",
      );
      setPending(false);
    }
  }

  const canDelete = reauthed && confirm === "DELETE" && !pending;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-xl font-bold text-foreground">Delete your account</Text>
      <Text className="mt-3 text-sm text-shell-dim">
        This permanently deletes your Inklee account: your booking history,
        client data, uploaded photos, and your public page. This cannot be
        undone.
      </Text>

      {/* Step 1 — re-authenticate */}
      <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-shell-mute">
        Confirm it&apos;s you
      </Text>
      {reauthed ? (
        <View className="flex-row items-center gap-2">
          <Ionicons name="checkmark-circle" size={20} color={themed.successFg} />
          <Text className="text-sm font-semibold text-success-fg">
            Identity confirmed
          </Text>
        </View>
      ) : provider === "email" ? (
        <View className="gap-2">
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Your password"
            placeholderTextColor={themed.shell.mute}
            className="h-12 rounded-xl border border-shell-border px-4 text-foreground"
          />
          <Button
            label="Confirm"
            variant="secondary"
            loading={reauthPending}
            disabled={reauthPending || !password}
            onPress={() => reauth(() => signInWithPassword(email, password))}
          />
        </View>
      ) : provider === "apple" ? (
        <Button
          label="Confirm with Apple"
          variant="secondary"
          loading={reauthPending}
          onPress={() => reauth(signInWithApple)}
        />
      ) : (
        <Button
          label="Confirm with Google"
          variant="secondary"
          loading={reauthPending}
          onPress={() => reauth(signInWithGoogle)}
        />
      )}
      {reauthError ? (
        <Text className="mt-2 text-sm text-danger-fg">{reauthError}</Text>
      ) : null}

      {/* Step 2 — type to confirm */}
      <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-shell-mute">
        Type DELETE to confirm
      </Text>
      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="DELETE"
        placeholderTextColor={themed.shell.mute}
        accessibilityLabel="Type DELETE to confirm account deletion"
        className="h-12 rounded-xl border border-shell-border px-4 text-foreground"
      />

      {error ? <Text className="mt-3 text-sm text-danger-fg">{error}</Text> : null}

      <View className="mt-6">
        <Button
          label="Delete account"
          variant="danger"
          loading={pending}
          disabled={!canDelete}
          onPress={onDelete}
        />
      </View>
    </ScrollView>
  );
}
