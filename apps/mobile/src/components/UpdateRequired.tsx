import { Linking, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";

/**
 * Full-screen, non-dismissable block shown when the installed build is older
 * than the server's minimum supported version (the min-version kill-switch).
 * No back and no close: the only way forward is to update.
 */
export function UpdateRequired({ url }: { url: string | null }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-8">
      <Text className="text-center text-xl font-semibold text-foreground">
        Update required
      </Text>
      <Text className="mt-3 text-center text-sm text-shell-dim">
        This version of Inklee is out of date. Please update to the latest
        version to keep using the app.
      </Text>
      {url ? (
        <View className="mt-6 self-center">
          <Button
            label="Update now"
            variant="primary"
            onPress={() => {
              void Linking.openURL(url);
            }}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
