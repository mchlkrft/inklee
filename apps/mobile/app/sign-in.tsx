import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { useAuth } from "@/lib/auth";

// E1 sign-in: email + password, plus Sign in with Apple (iOS) and Google.
// Apple is required by App Store review because Google sign-in is offered.
export default function SignIn() {
  const { signInWithPassword } = useAuth();
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
        <Text className="text-3xl font-bold text-bone">Inklee</Text>
        <Text className="mt-1 mb-8 text-base text-shell-dim">
          Sign in to your artist account.
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="rgba(229,225,213,0.32)"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          className="mb-3 h-12 rounded-xl border border-shell-border px-4 text-bone"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="rgba(229,225,213,0.32)"
          secureTextEntry
          autoComplete="current-password"
          className="mb-4 h-12 rounded-xl border border-shell-border px-4 text-bone"
        />

        {error ? (
          <Text className="mb-3 text-sm text-danger">{error}</Text>
        ) : null}

        <Button label="Sign in" onPress={submit} loading={loading} />

        <SocialAuthButtons />
      </View>
    </Screen>
  );
}
