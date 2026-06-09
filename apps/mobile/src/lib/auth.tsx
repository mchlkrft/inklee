import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "./supabase";
import { track } from "./analytics";
import { deregisterPushTokenAsync, registerPushTokenAsync } from "./push";

// Lets expo-web-browser tear down the auth session cleanly once the OAuth
// redirect comes back to the app.
WebBrowser.maybeCompleteAuthSession();

// Supabase recommends driving token auto-refresh off foreground state in RN.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

type AuthState = {
  session: Session | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const userId = session?.user?.id;
  // The Expo push token for this device, held so signOut can deregister it
  // while the session (and thus the Bearer token) is still valid.
  const pushTokenRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Register this device for push once a user is signed in (re-runs only when
  // the user changes, not on token refresh; the server upsert makes a repeat
  // harmless). Deregistration happens in signOut, before the session is cleared.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    registerPushTokenAsync().then((token) => {
      // If the user changed / signed out before this resolved, drop the token
      // instead of writing a now-stale ref. A device_tokens row the server may
      // have already upserted is benign and self-heals — the next sign-in on
      // this device reclaims the token via the unique-on-token upsert.
      if (!cancelled && token) pushTokenRef.current = token;
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      signInWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw new Error(error.message);
        track("sign_in", { method: "password" });
      },
      // Google: open Supabase's OAuth URL in an in-app browser, then exchange
      // the returned PKCE code for a session. Mirrors the web GoogleAuthButton
      // (same provider + queryParams). onAuthStateChange picks up the session.
      signInWithGoogle: async () => {
        const redirectTo = Linking.createURL("auth-callback");
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams: { access_type: "offline", prompt: "consent" },
          },
        });
        if (error) throw new Error(error.message);
        if (!data?.url) throw new Error("Could not start Google sign-in.");

        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
        );
        // User closed the sheet — not an error, just bail quietly.
        if (result.type !== "success") return;

        const { queryParams } = Linking.parse(result.url);
        const code = queryParams?.code;
        if (typeof code !== "string") {
          throw new Error("Google sign-in did not complete. Try again.");
        }
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw new Error(exchangeError.message);
        track("sign_in", { method: "google" });
      },
      // Apple (iOS only): native Sign in with Apple → exchange the identity
      // token for a Supabase session. Required by App Store review because we
      // offer Google sign-in. The caller (AppleSignInButton) is iOS-gated.
      signInWithApple: async () => {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        if (!credential.identityToken) {
          throw new Error("Apple did not return an identity token.");
        }
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });
        if (error) throw new Error(error.message);
        track("sign_in", { method: "apple" });
      },
      signOut: async () => {
        // Deregister while still authenticated; deregister swallows its own
        // errors so a failure here never blocks sign-out.
        const token = pushTokenRef.current;
        if (token) {
          await deregisterPushTokenAsync(token);
          pushTokenRef.current = null;
        }
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
