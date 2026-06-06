import { ScrollView, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Me = {
  userId: string;
  slug: string | null;
  displayName: string | null;
  timezone: string;
  onboardingCompleted: boolean;
  plan: string;
  canCollectDeposits: boolean;
};

export default function MoreScreen() {
  const { signOut } = useAuth();
  const { data } = useApiQuery<Me>("/me");

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text className="py-2 text-2xl font-bold text-bone">More</Text>

        <Card>
          <Text className="text-lg font-semibold text-bone">
            {data?.displayName ?? "Your account"}
          </Text>
          {data?.slug ? (
            <Text className="mt-0.5 text-sm text-shell-dim">
              inkl.ee/{data.slug}
            </Text>
          ) : null}
          {data ? (
            <View className="mt-3 flex-row gap-2">
              <View className="rounded-full bg-mustard/20 px-2.5 py-1">
                <Text className="text-xs font-semibold text-mustard">
                  {data.plan} plan
                </Text>
              </View>
              {data.canCollectDeposits ? (
                <View className="rounded-full bg-success/20 px-2.5 py-1">
                  <Text className="text-xs font-semibold text-success">
                    Deposits on
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Card>

        <Text className="mb-2 mt-6 text-xs uppercase tracking-wide text-shell-mute">
          Grow · Set up · Insights — coming in later slices
        </Text>

        <View className="mt-6">
          <Button label="Sign out" variant="secondary" onPress={signOut} />
        </View>
      </ScrollView>
    </Screen>
  );
}
