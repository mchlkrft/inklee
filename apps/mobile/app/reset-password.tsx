import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { PasswordInput } from "@/components/PasswordInput";
import { useAuth } from "@/lib/auth";
import { captureError } from "@/lib/telemetry";

// Password reset, completion half. Landing for the recovery link from
// forgot-password, which sets redirectTo to inklee://reset-password so the code
// is exchanged ON THIS DEVICE (PKCE). We HOLD the code and exchange it only when
// the artist submits a new password: that way no session exists while the form
// is shown (the root navigator would otherwise route into the app the moment a
// session lands), and on success the new session drops the artist straight in.
export default function ResetPassword() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    error_description?: string | string[];
  }>();
  const { completePasswordReset } = useAuth();
  const router = useRouter();

  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const code = first(params.code);
  const linkError = first(params.error_description);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Exchanging the code sets a session, which can unmount this screen mid-submit
  // (the navigator's boot gate). Guard state writes so a late error/loading
  // update after unmount is a no-op rather than a warning.
  const mounted = useRef(true);
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submit() {
    if (!code) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await completePasswordReset(code, password);
      // Success: the session is live with the new password and the root
      // navigator routes into the app, so this screen unmounts on its own.
    } catch (e) {
      captureError(e, { op: "resetPassword" });
      if (mounted.current) {
        setError(
          e instanceof Error
            ? e.message
            : "Couldn't reset your password. Request a new link.",
        );
        setLoading(false);
      }
    }
  }

  if (!code) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-2">
          <Text className="text-center text-base font-semibold text-foreground">
            This reset link is invalid or expired
          </Text>
          <Text className="mt-2 text-center text-sm text-shell-dim">
            {linkError ?? "Request a new link and open it on this device."}
          </Text>
          <View className="mt-6">
            <Button
              label="Back to sign in"
              variant="secondary"
              onPress={() => router.replace("/sign-in")}
            />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text className="text-3xl font-bold text-foreground">
          Set a new password
        </Text>
        <Text className="mt-1 mb-8 text-base text-shell-dim">
          Choose a new password for your Inklee account.
        </Text>

        <PasswordInput
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          autoComplete="new-password"
        />
        <View className="h-3" />
        <PasswordInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm new password"
          autoComplete="new-password"
        />
        <Text className="mb-4 mt-1.5 text-xs text-shell-mute">
          Use at least 8 characters.
        </Text>

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button label="Update password" onPress={submit} loading={loading} />
      </View>
    </Screen>
  );
}
