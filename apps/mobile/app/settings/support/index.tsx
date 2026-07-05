import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SUPPORT_FAQ } from "@inklee/shared/support-faq";
import { SUPPORT_CATEGORY_LABELS } from "@inklee/shared/support";
import type { MobileSupportList } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SectionLabel } from "@/components/SectionLabel";
import { BrandLoader } from "@/components/BrandLoader";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";

// A support FAQ answer may point at a web route. Map only the ones with a real
// native screen; unmapped answers still stand on their own text.
const FAQ_NATIVE_ROUTE: Record<string, string> = {
  "/settings/payouts": "/settings/payouts",
  "/settings/account": "/settings/account",
  "/bookings/form": "/settings/booking-form",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

export default function SupportScreen() {
  const q = useApiQuery<MobileSupportList>("/support");
  const router = useRouter();
  const colors = useColors();
  const queryClient = useQueryClient();
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  // Refetch on focus so a just-created ticket appears and a read ticket's "New
  // reply" flag clears when returning to this list.
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["api", "/support"] });
    }, [queryClient]),
  );

  const tickets = q.data?.tickets ?? [];

  // Only the tickets fetch can fail; the FAQ + New request must stay usable, so
  // gate just the first paint on the loader, never the whole screen on an error.
  if (!q.data && q.loading) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          <BrandLoader />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={colors.accent}
          />
        }
      >
        <Text className="text-sm text-shell-dim">
          Tell us what is going wrong and include as much detail as possible. We
          reply inside the app and email you when something changes.
        </Text>

        <View className="mt-4">
          <Button
            label="New support request"
            onPress={() => router.push("/settings/support/new")}
          />
        </View>

        {q.data === null && q.error ? (
          <Text className="mt-3 text-sm text-danger-fg">
            Couldn&apos;t load your tickets. Pull to refresh.
          </Text>
        ) : null}

        {tickets.length > 0 ? (
          <>
            <SectionLabel>Your tickets</SectionLabel>
            <Card>
              {tickets.map((t, i) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/settings/support/${t.id}`)}
                  className={`flex-row items-center gap-3 py-3 active:opacity-70 ${
                    i > 0 ? "border-t border-shell-border" : ""
                  }`}
                >
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xs font-mono text-shell-mute">
                        {t.reference}
                      </Text>
                      {t.unread ? (
                        <View className="rounded-full bg-mustard px-2 py-0.5">
                          <Text className="text-[10px] font-semibold text-charcoal">
                            New reply
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      className="mt-0.5 text-base font-medium text-foreground"
                      numberOfLines={1}
                    >
                      {t.subject}
                    </Text>
                    <Text className="mt-0.5 text-xs text-shell-dim">
                      {SUPPORT_CATEGORY_LABELS[t.category]} · updated{" "}
                      {formatDate(t.updatedAt)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.shell.dim}
                  />
                </Pressable>
              ))}
            </Card>
          </>
        ) : null}

        <SectionLabel>Common problems</SectionLabel>
        <Card>
          {SUPPORT_FAQ.map((item, i) => {
            const isOpen = openFaq === item.question;
            const nativeRoute = item.href
              ? FAQ_NATIVE_ROUTE[item.href]
              : undefined;
            return (
              <View
                key={item.question}
                className={i > 0 ? "border-t border-shell-border" : ""}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  onPress={() => setOpenFaq(isOpen ? null : item.question)}
                  className="flex-row items-center gap-2 py-3 active:opacity-70"
                >
                  <Ionicons
                    name={isOpen ? "chevron-down" : "chevron-forward"}
                    size={16}
                    color={colors.shell.dim}
                  />
                  <Text className="flex-1 text-sm font-medium text-foreground">
                    {item.question}
                  </Text>
                </Pressable>
                {isOpen ? (
                  <View className="pb-3 pl-6">
                    <Text className="text-sm leading-relaxed text-shell-dim">
                      {item.answer}
                    </Text>
                    {nativeRoute ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push(nativeRoute as never)}
                        className="mt-2 active:opacity-70"
                      >
                        <Text className="text-sm font-semibold text-accent">
                          {item.linkLabel ?? "Open settings"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </Screen>
  );
}
