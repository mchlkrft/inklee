import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { PasswordInput } from "@/components/PasswordInput";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { useAuth } from "@/lib/auth";
import { useColors } from "@/lib/theme";

// E1 sign-in: email + password, plus Sign in with Apple (iOS) and Google.
// Apple is required by App Store review because Google sign-in is offered.
export default function SignIn() {
  const { signInWithPassword } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View className="flex-1 justify-center">
        <Text className="text-3xl font-bold text-foreground">Inklee</Text>
        <Text className="mt-1 mb-8 text-base text-shell-dim">
          Sign in to your artist account.
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
          className="mb-2"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          autoComplete="current-password"
        />
        <Pressable
          onPress={() => router.push("/forgot-password")}
          className="mb-4 self-end active:opacity-70"
        >
          <Text className="text-sm text-accent">Forgot password?</Text>
        </Pressable>

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <Button label="Sign in" onPress={submit} loading={loading} />

        <SocialAuthButtons />

        <Pressable
          onPress={() => router.push("/sign-up")}
          className="mt-6 active:opacity-70"
        >
          <Text className="text-center text-sm text-shell-dim">
            New to Inklee?{" "}
            <Text className="font-medium text-accent">Create an account</Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
