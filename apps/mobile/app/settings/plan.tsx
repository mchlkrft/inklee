import { ActivityIndicator, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import type { MobileMe } from "@inklee/shared/mobile-api";

// Read-only plan display. Billing is web-only (no in-app purchase), so this
// screen never links out to a purchase or checkout: it shows the plan, the
// early-artist grandfather note, and what Plus includes, with a passive note
// that the plan is managed on the web. No upgrade CTA (IAP compliance).
const PLUS_INCLUDES = [
  "No “made with Inklee” footer on your public pages",
  "Custom booking email templates",
  "Up to 30 custom form fields, 100 guest-spot trips, and 50 studios",
  "Advanced booking analytics",
];

export default function PlanScreen() {
  useScreenView("settings_plan");
  const colors = useColors();
  const q = useApiQuery<MobileMe>("/me");
  const me = q.data;

  if (!me) {
    return (
      <Screen edges={["left", "right"]}>
        {q.loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <ErrorState
            title="Couldn't load your plan"
            subtitle={q.error ?? undefined}
            onRetry={q.refresh}
          />
        )}
      </Screen>
    );
  }

  const isPlus = me.plan === "plus";

  return (
    <Screen edges={["left", "right"]} column="form">
      <View className="flex-1 pt-3">
        <Card>
          <Text className="text-sm text-shell-dim">Current plan</Text>
          <Text className="mt-1 text-2xl font-semibold text-foreground">
            {isPlus ? "Plus" : "Free"}
          </Text>
          {!isPlus && me.grandfathered ? (
            <Text className="mt-3 text-sm text-shell-dim">
              You&apos;re on Free with early-artist benefits.
              {me.keepsTemplates
                ? " You keep custom email templates from before Plus launched."
                : ""}
            </Text>
          ) : null}
        </Card>

        <Text className="mb-2 mt-6 text-sm font-medium text-foreground">
          {isPlus ? "Your Plus benefits" : "What Plus includes"}
        </Text>
        <Card>
          {PLUS_INCLUDES.map((b, i) => (
            <View
              key={b}
              className={`flex-row items-start gap-2 py-2.5 ${
                i > 0 ? "border-t border-shell-border" : ""
              }`}
            >
              <Text className="text-base text-accent">{"✓"}</Text>
              <Text className="flex-1 text-sm text-foreground">{b}</Text>
            </View>
          ))}
        </Card>

        <Text className="mt-5 text-xs text-shell-dim">
          Your plan and billing are managed on the web.
        </Text>
      </View>
    </Screen>
  );
}
