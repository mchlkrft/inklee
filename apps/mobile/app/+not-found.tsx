import { Stack, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";

// Catch-all for unmatched routes. The main way to land here is a deep link or
// push notification that targets a screen this (older) build doesn't have —
// version skew, not a bug. Offer a way home instead of a dead end.
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-8">
      <Stack.Screen options={{ headerShown: false }} />
      <Text className="text-center text-xl font-semibold text-foreground">
        Screen not available
      </Text>
      <Text className="mt-3 text-center text-sm text-shell-dim">
        This screen isn't available in this version of the app. Updating to the
        latest version usually fixes this.
      </Text>
      <View className="mt-6 self-center">
        <Button
          label="Go to home"
          variant="primary"
          onPress={() => router.replace("/")}
        />
      </View>
    </SafeAreaView>
  );
}
