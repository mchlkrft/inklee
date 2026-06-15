import { View } from "react-native";
import { Button } from "./Button";
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
      <View className="mt-2">
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
