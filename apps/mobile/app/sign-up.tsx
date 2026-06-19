import { useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { PasswordInput } from "@/components/PasswordInput";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/lib/theme";
import { captureError } from "@/lib/telemetry";
import { config } from "@/lib/config";
import {
  validatePassword,
  PASSWORD_MIN_LENGTH,
} from "@inklee/shared/auth-validation";

// Native email/password sign-up (E1 follow-up: the app shipped sign-in only, so
// new email artists had to register on the web). Mirrors the web signup action
// -- Supabase signUp + the "check your email" confirmation state -- and reuses
// the same Google / Apple buttons, which create the account on first use.
export default function SignUp() {
  const { signUpWithPassword } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const openLegal = (path: string) => {
    void Linking.openURL(`${config.apiUrl}${path}`).catch(() => {});
  };

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Email and password are required.");
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { needsConfirmation } = await signUpWithPassword(trimmed, password);
      // No confirmation needed means a session already exists; the root
      // navigator routes straight into onboarding, so there's nothing to do.
      if (needsConfirmation) setSent(true);
    } catch (e) {
      captureError(e, { op: "signUp" });
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't create your account. Try again.",
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
            We sent a confirmation link to {email.trim() || "your inbox"}. Tap it
            to confirm your account and finish setting up.
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
          Create your account
        </Text>
        <Text className="mt-1 mb-8 text-base text-shell-dim">
          Set up your Inklee artist account.
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.shell.mute}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          className="mb-3 h-12 rounded-xl border border-shell-border px-4 text-foreground"
        />
        <PasswordInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          autoComplete="new-password"
        />
        <Text className="mb-4 mt-1.5 text-xs text-shell-mute">
          Use at least {PASSWORD_MIN_LENGTH} characters.
        </Text>

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button label="Create account" onPress={submit} loading={loading} />

        <Text className="mt-4 text-xs leading-relaxed text-shell-mute">
          By creating an account you agree to our{" "}
          <Text className="text-accent" onPress={() => openLegal("/terms")}>
            Terms
          </Text>
          ,{" "}
          <Text
            className="text-accent"
            onPress={() => openLegal("/acceptable-use")}
          >
            Acceptable Use Policy
          </Text>
          , and{" "}
          <Text className="text-accent" onPress={() => openLegal("/privacy")}>
            Privacy Policy
          </Text>
          .
        </Text>

        <SocialAuthButtons />

        <Pressable
          onPress={() => router.replace("/sign-in")}
          className="mt-6 active:opacity-70"
        >
          <Text className="text-center text-sm text-shell-dim">
            Already have an account?{" "}
            <Text className="font-medium text-accent">Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
