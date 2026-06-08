import { Pressable, Text, View } from "react-native";
import { EmptyState } from "./EmptyState";
import { t } from "@/lib/i18n";

// The shared "couldn't load → Try again" affordance for every list/scroll
// screen. Extracted because the retry block was hand-copied across screens and
// drifted (notifications shipped with NO retry button while its siblings had
// one). Centralizing it makes that drift impossible and routes the label through
// i18n. Render inside a FlatList's ListEmptyComponent or a ScrollView body.
export function ErrorState({
  title,
  subtitle,
  onRetry,
}: {
  title: string;
  subtitle?: string;
  onRetry: () => void;
}) {
  return (
    <View className="items-center pt-8">
      <EmptyState title={title} subtitle={subtitle} />
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="mt-2 h-11 items-center justify-center rounded-xl border border-shell-border px-5 active:opacity-80"
      >
        <Text className="text-sm font-semibold text-bone">
          {t("common.tryAgain")}
        </Text>
      </Pressable>
    </View>
  );
}
