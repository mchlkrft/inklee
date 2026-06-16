import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { BrandLoader } from "@/components/BrandLoader";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { captureError } from "@/lib/telemetry";

// Landing for the email-confirmation link from a native sign-up. sign-up sets
// emailRedirectTo to inklee://auth-confirm, so confirmation completes ON THIS
// DEVICE. On success onAuthStateChange sets the session and the root navigator
// swaps to onboarding (this screen unmounts with the boot transition). This is a
// separate deep-link path from the OAuth auth-callback, which is captured in-flow
// by openAuthSessionAsync instead.
//
// Two link shapes are handled: the Send Email hook (the live path for
// email/password signup) deep-links a `token_hash` + `type` OTP, verified here
// with verifyOtp; a PKCE `code` link is exchanged with exchangeCodeForSession.
export default function AuthConfirm() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    token_hash?: string | string[];
    type?: string | string[];
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
    const tokenHash = first(params.token_hash);
    const type = first(params.type) as EmailOtpType | undefined;
    const onFail = (e: unknown) => {
      captureError(e, { op: "authConfirm" });
      setError("Couldn't confirm your account. Try signing in.");
    };

    if (tokenHash && type) {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type })
        .then(({ error: vErr }) => {
          if (vErr) setError(vErr.message);
        })
        .catch(onFail);
    } else if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error: exErr }) => {
          if (exErr) setError(exErr.message);
        })
        .catch(onFail);
    } else {
      setError(
        first(params.error_description) ??
          "This confirmation link is invalid or has expired.",
      );
    }
  }, [
    params.code,
    params.token_hash,
    params.type,
    params.error_description,
  ]);

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
