import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { BorderedInput } from "@/components/BorderedInput";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/lib/theme";
import { captureError } from "@/lib/telemetry";

// Password reset, request half. An email/password artist who forgot their
// password previously had no in-app recovery (only sign-in existed). Mirrors the
// web forgotPasswordAction: send the reset email, then show a neutral "check
// your inbox" state whether or not the address has an account (Supabase never
// reveals it). The link deep-links back to reset-password on this device.
export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendPasswordReset(trimmed);
      setSent(true);
    } catch (e) {
      captureError(e, { op: "forgotPassword" });
      setError(
        e instanceof Error ? e.message : "Couldn't send the email. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <View className="flex-1 justify-center">
          <View className="mb-5 h-12 w-12 items-center justify-center rounded-full bg-mustard/15">
            <Mail size={22} color={colors.accent} />
          </View>
          <Text className="text-2xl font-bold text-foreground">
            Check your email
          </Text>
          <Text className="mt-2 text-base text-shell-dim">
            If an account exists for {email.trim() || "that address"}, we sent a
            link to reset your password. Open it on this device to continue.
          </Text>
          <View className="mt-8">
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
          Reset your password
        </Text>
        <Text className="mt-1 mb-8 text-base text-shell-dim">
          Enter your email and we will send you a reset link.
        </Text>

        <BorderedInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          className="mb-4"
        />

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button label="Send reset link" onPress={submit} loading={loading} />

        <Pressable
          onPress={() => router.replace("/sign-in")}
          className="mt-6 active:opacity-70"
        >
          <Text className="text-center text-sm text-shell-dim">
            Remembered it? <Text className="font-medium text-accent">Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
