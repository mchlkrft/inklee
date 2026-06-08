import "../global.css";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
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

function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-charcoal">
        <ActivityIndicator color="#e9b22b" />
      </View>
    );
  }

  // Stack.Protected flips the available routes off the session, so signing in /
  // out automatically moves the user between the tabs and the sign-in screen —
  // no manual navigation needed.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#1e1e1e" },
      }}
    >
      <Stack.Protected guard={!!session}>
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
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
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
