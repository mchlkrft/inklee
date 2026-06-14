import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BrandLoader } from "@/components/BrandLoader";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { captureError } from "@/lib/telemetry";

// Landing for the email-confirmation link from a native sign-up. sign-up sets
// emailRedirectTo to inklee://auth-confirm, so the code is exchanged ON THIS
// DEVICE, which holds the PKCE verifier. On success onAuthStateChange sets the
// session and the root navigator swaps to onboarding (this screen unmounts with
// the boot transition). This is a separate deep-link path from the OAuth
// auth-callback, which is captured in-flow by openAuthSessionAsync instead.
export default function AuthConfirm() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    error_description?: string | string[];
  }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = first(params.code);
    if (!code) {
      setError(
        first(params.error_description) ??
          "This confirmation link is invalid or has expired.",
      );
      return;
    }
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: exErr }) => {
        if (exErr) setError(exErr.message);
      })
      .catch((e) => {
        captureError(e, { op: "authConfirm" });
        setError("Couldn't confirm your account. Try signing in.");
      });
  }, [params.code, params.error_description]);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center text-base font-semibold text-foreground">
          Couldn&apos;t confirm your account
        </Text>
        <Text className="mt-2 text-center text-sm text-shell-dim">{error}</Text>
        <View className="mt-6">
          <Button
            label="Back to sign in"
            variant="secondary"
            onPress={() => router.replace("/sign-in")}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <BrandLoader />
    </View>
  );
}
