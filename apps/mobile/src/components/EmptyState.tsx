import { Text, View } from "react-native";

export function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="items-center justify-center py-16">
      <Text className="text-center text-base font-semibold text-bone">
        {title}
      </Text>
      {subtitle ? (
        <Text className="mt-1 text-center text-sm text-shell-dim">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
