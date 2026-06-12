import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/lib/auth";
import { control } from "@/lib/tokens";

// Sign in with Apple + Google for the sign-in screen. Apple is iOS-only (App
// Store requires it because we offer Google); Google works on both platforms.
// Errors surface inline; user cancellations are swallowed silently.
export function SocialAuthButtons() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [pending, setPending] = useState<null | "google" | "apple">(null);
  const [error, setError] = useState<string | null>(null);

  async function runGoogle() {
    setPending("google");
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
    } finally {
      setPending(null);
    }
  }

  async function runApple() {
    setPending("apple");
    setError(null);
    try {
      await signInWithApple();
    } catch (e) {
      // The user tapping "Cancel" on the Apple sheet throws this code — not a
      // real error, so don't show a scary message.
      if (
        e instanceof Error &&
        "code" in e &&
        (e as { code?: string }).code === "ERR_REQUEST_CANCELED"
      ) {
        return;
      }
      setError(e instanceof Error ? e.message : "Apple sign-in failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <View>
      <View className="my-5 flex-row items-center">
        <View className="h-px flex-1 bg-shell-border" />
        <Text className="mx-3 text-xs uppercase tracking-wide text-shell-dim">
          or
        </Text>
        <View className="h-px flex-1 bg-shell-border" />
      </View>

      <Pressable
        onPress={runGoogle}
        disabled={pending !== null}
        className={`h-13 flex-row items-center justify-center gap-2.5 rounded-full border border-shell-border px-5 active:opacity-80 ${
          pending !== null ? "opacity-50" : ""
        }`}
      >
        {pending === "google" ? (
          <ActivityIndicator color="#e5e1d5" />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color="#e5e1d5" />
            <Text className="text-base font-semibold text-foreground">
              Continue with Google
            </Text>
          </>
        )}
      </Pressable>

      {Platform.OS === "ios" ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          }
          buttonStyle={
            AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          }
          // Native style props can't use the h-13/rounded-full classes, so the
          // md control height (52) and half-height corner make the same pill.
          cornerRadius={control.md / 2}
          style={{ height: control.md, marginTop: 12 }}
          onPress={runApple}
        />
      ) : null}

      {error ? (
        <Text className="mt-3 text-sm text-danger">{error}</Text>
      ) : null}
    </View>
  );
}
