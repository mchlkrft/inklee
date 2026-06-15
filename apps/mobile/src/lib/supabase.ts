import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

// The artist's Supabase session lives in the device keychain/keystore via
// expo-secure-store (never AsyncStorage plaintext). SecureStore caps values at
// ~2KB; Supabase sessions sit comfortably under that. The access token from this
// session is what we send as `Authorization: Bearer` to /api/mobile/*.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loudly in dev rather than producing a client that 401s everything.
  console.warn(
    "[inklee] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env.local.",
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE is the secure OAuth flow for native apps: signInWithOAuth returns a
    // URL, the code verifier is stashed in SecureStore, and we finish with
    // exchangeCodeForSession(code) after the browser redirects back. (Sign in
    // with Apple uses the native id-token flow instead, no redirect.)
    flowType: "pkce",
  },
});
