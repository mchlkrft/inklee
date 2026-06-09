import "../global.css";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import type { MobileMe } from "@inklee/shared/mobile-api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useApiQuery } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { t } from "@/lib/i18n";

// One client for the app. 30s staleTime keeps tab switches from refetching
// constantly; one retry smooths transient mobile-network blips.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

// Expo Router renders this for any uncaught render error in the tree instead of
// white-screening the whole app. Charcoal fallback + retry (re-mounts the
// segment). Telemetry is wired in src/lib/telemetry once it lands.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    captureError(error, { boundary: "root" });
  }, [error]);

  return (
    <View className="flex-1 items-center justify-center bg-charcoal px-8">
      <Text className="text-lg font-semibold text-bone">{t("error.title")}</Text>
      <Text className="mt-2 text-center text-sm text-shell-dim">
        {error.message || t("error.body")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        className="mt-5 h-11 items-center justify-center rounded-xl border border-shell-border px-6 active:opacity-80"
      >
        <Text className="text-sm font-semibold text-bone">
          {t("common.tryAgain")}
        </Text>
      </Pressable>
    </View>
  );
}

// Centered charcoal splash — used while the session and then /me resolve, so a
// fresh sign-in never flashes the wrong stack before the gate is known.
function Splash() {
  return (
    <View className="flex-1 items-center justify-center bg-charcoal">
      <ActivityIndicator color="#e9b22b" />
    </View>
  );
}

// Shown when /me fails and nothing is cached — don't guess the gate, let the
// artist retry rather than dropping them on the wrong stack.
function RetrySplash({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-charcoal px-8">
      <Text className="text-center text-sm text-shell-dim">{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="mt-5 h-11 items-center justify-center rounded-xl border border-shell-border px-6 active:opacity-80"
      >
        <Text className="text-sm font-semibold text-bone">
          {t("common.tryAgain")}
        </Text>
      </Pressable>
    </View>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  // Drop the previous session's cached data when the signed-in user changes
  // (sign-out, or switching accounts) so the /me gate can never read a prior
  // user's onboarding state. Skips the initial undefined→user bootstrap (cache
  // is already empty) to avoid a redundant clear / splash flicker.
  const prevUserId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevUserId.current !== undefined && prevUserId.current !== userId) {
      queryClient.clear();
    }
    prevUserId.current = userId;
  }, [userId, queryClient]);

  // /me drives the third routing state. Only fetch once a session exists.
  const me = useApiQuery<MobileMe>("/me", { enabled: !!session });
  // Trust /me only when it belongs to the *current* user — guards the brief
  // window where a prior session's row is still settling out of cache.
  const meReady = !!me.data && me.data.userId === userId;
  const needsOnboarding = meReady && me.data?.onboardingCompleted !== true;
  const onboarded = meReady && me.data?.onboardingCompleted === true;

  // Session bootstrapping.
  if (loading) return <Splash />;
  // Signed in, /me not yet resolved for this user — hold the splash.
  if (session && !meReady && !me.error) return <Splash />;
  // Signed in, /me errored with nothing cached — offer a retry instead of
  // guessing onboarding vs tabs.
  if (session && !meReady && me.error) {
    return <RetrySplash message={me.error} onRetry={me.refresh} />;
  }

  // Stack.Protected flips the available routes off the session + /me, so signing
  // in/out and completing onboarding automatically move the artist between the
  // sign-in screen, the onboarding stack, and the tabs — no manual navigation.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#1e1e1e" },
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>

      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="bookings/[id]"
          options={{
            headerShown: true,
            title: "Request",
            headerStyle: { backgroundColor: "#1e1e1e" },
            headerTintColor: "#e5e1d5",
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="clients/[email]"
          options={{
            headerShown: true,
            title: "Client",
            headerStyle: { backgroundColor: "#1e1e1e" },
            headerTintColor: "#e5e1d5",
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="account/delete"
          options={{
            headerShown: true,
            title: "Delete account",
            headerStyle: { backgroundColor: "#1e1e1e" },
            headerTintColor: "#e5e1d5",
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            headerShown: true,
            title: "Notifications",
            headerStyle: { backgroundColor: "#1e1e1e" },
            headerTintColor: "#e5e1d5",
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="insights"
          options={{
            headerShown: true,
            title: "Insights",
            headerStyle: { backgroundColor: "#1e1e1e" },
            headerTintColor: "#e5e1d5",
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="waitlist"
          options={{
            headerShown: true,
            title: "Waitlist",
            headerStyle: { backgroundColor: "#1e1e1e" },
            headerTintColor: "#e5e1d5",
            headerShadowVisible: false,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
