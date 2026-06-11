import "../global.css";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import type { MobileMe } from "@inklee/shared/mobile-api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider, useThemeColors } from "@/lib/theme";
import { useApiQuery } from "@/lib/api";
import { usePushResponseObserver } from "@/lib/push";
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
    <View className="flex-1 items-center justify-center bg-background px-8">
      <Text className="text-lg font-semibold text-foreground">
        {t("error.title")}
      </Text>
      <Text className="mt-2 text-center text-sm text-shell-dim">
        {error.message || t("error.body")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        className="mt-5 h-11 items-center justify-center rounded-xl border border-shell-border px-6 active:opacity-80"
      >
        <Text className="text-sm font-semibold text-foreground">
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
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color="#e9b22b" />
    </View>
  );
}

// Status-bar icons flip with the theme: light glyphs on the dark shell, dark
// glyphs on the bone surface. Reads the NativeWind scheme so it honors the
// in-app override, not just the OS setting.
function ThemedStatusBar() {
  const { colorScheme } = useColorScheme();
  return <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />;
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
    <View className="flex-1 items-center justify-center bg-background px-8">
      <Text className="text-center text-sm text-shell-dim">{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="mt-5 h-11 items-center justify-center rounded-xl border border-shell-border px-6 active:opacity-80"
      >
        <Text className="text-sm font-semibold text-foreground">
          {t("common.tryAgain")}
        </Text>
      </Pressable>
    </View>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const queryClient = useQueryClient();
  const theme = useThemeColors();
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

  // Deep-link a tapped push notification to its screen. Gated on `onboarded` so
  // it never targets a route that isn't mounted (the protected stack); a tap
  // that lands during cold start is routed once the gate resolves.
  usePushResponseObserver(onboarded);

  // Session bootstrapping.
  if (loading) return <Splash />;
  // Signed in, /me not yet resolved for this user — hold the splash.
  if (session && !meReady && !me.error) return <Splash />;
  // Signed in, /me errored with nothing cached — offer a retry instead of
  // guessing onboarding vs tabs.
  if (session && !meReady && me.error) {
    return <RetrySplash message={me.error} onRetry={me.refresh} />;
  }

  // Themed native-header options for the top-level Stack screens (themes with
  // the active scheme rather than the old hardcoded charcoal/bone).
  const stackHeader = {
    headerShown: true as const,
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.foreground,
    headerShadowVisible: false,
  };

  // Stack.Protected flips the available routes off the session + /me, so signing
  // in/out and completing onboarding automatically move the artist between the
  // sign-in screen, the onboarding stack, and the tabs — no manual navigation.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
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
        <Stack.Screen name="settings" />
        <Stack.Screen
          name="bookings/[id]"
          options={{ ...stackHeader, title: "Request" }}
        />
        <Stack.Screen
          name="clients/[email]"
          options={{ ...stackHeader, title: "Client" }}
        />
        <Stack.Screen
          name="account/delete"
          options={{ ...stackHeader, title: "Delete account" }}
        />
        <Stack.Screen
          name="notifications"
          options={{ ...stackHeader, title: "Notifications" }}
        />
        <Stack.Screen
          name="insights"
          options={{ ...stackHeader, title: "Insights" }}
        />
        <Stack.Screen
          name="waitlist"
          options={{ ...stackHeader, title: "Waitlist" }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <ThemedStatusBar />
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
