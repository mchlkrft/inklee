import "../global.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import type { MobileMe } from "@inklee/shared/mobile-api";
import { BrandLoader } from "@/components/BrandLoader";
import { Button } from "@/components/Button";
import { SplashOverlay } from "@/components/SplashOverlay";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider, useThemeColors, useThemePreference } from "@/lib/theme";
import { useApiQuery } from "@/lib/api";
import { usePushResponseObserver } from "@/lib/push";
import { captureError } from "@/lib/telemetry";
import { t } from "@/lib/i18n";

// Hold the native splash (the solid layer color) until the branded JS overlay
// mounts and takes over — SplashOverlay calls hideAsync on mount.
SplashScreen.preventAutoHideAsync().catch(() => {});

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
      <View className="mt-5 self-center">
        <Button
          label={t("common.tryAgain")}
          variant="secondary"
          size="sm"
          onPress={retry}
        />
      </View>
    </View>
  );
}

// In-app loading screen for MID-SESSION gates (account switch re-resolving
// /me) — the cold start shows the branded SplashOverlay instead.
function Splash() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <BrandLoader />
    </View>
  );
}

// Status-bar icons flip with the theme: light glyphs on the dark shell, dark
// glyphs on the bone surface. Reads the NativeWind scheme so it honors the
// in-app override, not just the OS setting.
function ThemedStatusBar() {
  const { scheme } = useThemePreference();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
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
      <View className="mt-5 self-center">
        <Button
          label={t("common.tryAgain")}
          variant="secondary"
          size="sm"
          onPress={onRetry}
        />
      </View>
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

  // Cold-start boot: the branded SplashOverlay covers the whole screen until
  // the session + /me gate resolves, then fades out over the mounted UI. It
  // unmounts for good after the first boot; mid-session gates (account switch)
  // fall back to the plain in-app Splash.
  const [splashDone, setSplashDone] = useState(false);
  const booting = loading || (!!session && !meReady && !me.error);

  // Themed native-header options for the top-level Stack screens (themes with
  // the active scheme rather than the old hardcoded charcoal/bone).
  const stackHeader = {
    headerShown: true as const,
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.foreground,
    headerShadowVisible: false,
  };

  let content: ReactNode;
  if (booting) {
    // Behind the overlay during cold start; the BrandLoader screen for the
    // mid-session re-resolve after the overlay is gone.
    content = splashDone ? (
      <Splash />
    ) : (
      <View className="flex-1 bg-background" />
    );
  } else if (session && !meReady && me.error) {
    // Signed in, /me errored with nothing cached — offer a retry instead of
    // guessing onboarding vs tabs (the overlay fades out to reveal it).
    content = <RetrySplash message={me.error} onRetry={me.refresh} />;
  } else {
    content = renderStack();
  }

  return (
    <View className="flex-1">
      {content}
      {!splashDone ? (
        <SplashOverlay
          ready={!booting}
          onDone={() => setSplashDone(true)}
        />
      ) : null}
    </View>
  );

  // Stack.Protected flips the available routes off the session + /me, so signing
  // in/out and completing onboarding automatically move the artist between the
  // sign-in screen, the onboarding stack, and the tabs — no manual navigation.
  function renderStack() {
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
          name="bookings/new"
          options={{ ...stackHeader, title: "New appointment" }}
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
          name="waitlist/index"
          options={{ ...stackHeader, title: "Waitlist" }}
        />
        <Stack.Screen
          name="waitlist/[id]"
          options={{ ...stackHeader, title: "Waitlist entry" }}
        />
      </Stack.Protected>
    </Stack>
    );
  }
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
