import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PillButton } from "@/components/PillButton";
import { SectionLabel } from "@/components/SectionLabel";
import { ErrorState } from "@/components/ErrorState";
import { useApiQuery, apiPost, apiDelete } from "@/lib/api";
import { displayUrl } from "@/lib/config";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import type { MobileCalendarExport } from "@inklee/shared/mobile-api";

const QUERY_KEY = ["api", "/settings/calendar-export"] as const;

// Private iCal feed link (web settings/calendar parity, ME-6): generate a
// tokened URL, subscribe from Google Calendar / Apple Calendar, revoke when a
// link leaks. The feed is a capability URL — anyone holding it sees upcoming
// appointment names and placements, which is why revoke stays prominent.
export default function CalendarExportScreen() {
  useScreenView("calendar_export");
  const themed = useColors();
  const queryClient = useQueryClient();
  const q = useApiQuery<MobileCalendarExport>("/settings/calendar-export");

  const [copied, markCopied] = useTimedFlag();
  const [pending, setPending] = useState<"generate" | "revoke" | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending("generate");
    setError(null);
    try {
      await apiPost<MobileCalendarExport>("/settings/calendar-export");
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (e) {
      captureError(e, { op: "generateIcalFeed" });
      setError("Couldn't generate the link. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function revoke() {
    setPending("revoke");
    setError(null);
    try {
      await apiDelete("/settings/calendar-export");
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setConfirmRevoke(false);
    } catch (e) {
      captureError(e, { op: "revokeIcalFeed" });
      setError("Couldn't revoke the link. Try again.");
    } finally {
      setPending(null);
    }
  }

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={themed.accent} />
          ) : (
            <ErrorState
              title="Couldn't load calendar export"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  const feedUrl = q.data.feedUrl;

  return (
    <Screen edges={["left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={q.refreshing}
            onRefresh={q.refresh}
            tintColor={themed.accent}
          />
        }
      >
        {feedUrl ? (
          <>
            <SectionLabel>Your iCal feed</SectionLabel>
            <Card>
              <Text className="text-sm text-shell-dim" numberOfLines={2} selectable>
                {displayUrl(feedUrl)}
              </Text>
              <View className="mt-3 flex-row gap-2">
                <PillButton
                  label={copied ? "Copied" : "Copy link"}
                  onPress={async () => {
                    await Clipboard.setStringAsync(feedUrl);
                    markCopied();
                  }}
                />
                {Platform.OS === "ios" ? (
                  <PillButton
                    label="Open in Calendar"
                    onPress={() => {
                      // Apple Calendar handles webcal:// system-wide with a
                      // subscribe sheet. No canOpenURL: it needs an
                      // LSApplicationQueriesSchemes entry and lies otherwise.
                      Linking.openURL(
                        feedUrl.replace(/^https?/, "webcal"),
                      ).catch(() => {
                        setError(
                          "Couldn't open your calendar app. Copy the link instead.",
                        );
                      });
                    }}
                  />
                ) : null}
              </View>
              <Text className="mt-3 text-sm text-shell-dim">
                Paste this URL into Google Calendar, Apple Calendar, or any app
                that supports iCal subscriptions. The feed updates
                automatically.
              </Text>
            </Card>

            <View className="mt-6">
              {confirmRevoke ? (
                <View className="gap-2 rounded-xl border border-danger/50 p-3">
                  <Text className="text-sm text-foreground">
                    Revoke this feed link?
                  </Text>
                  <Text className="text-xs text-shell-dim">
                    Calendar apps using the old link will stop updating.
                  </Text>
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Button
                        label="Yes, revoke link"
                        variant="danger"
                        size="sm"
                        loading={pending === "revoke"}
                        onPress={revoke}
                      />
                    </View>
                    <Button
                      label="Keep it"
                      variant="secondary"
                      size="sm"
                      disabled={pending === "revoke"}
                      onPress={() => setConfirmRevoke(false)}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  label="Revoke link"
                  variant="danger-outline"
                  size="sm"
                  onPress={() => setConfirmRevoke(true)}
                />
              )}
            </View>
          </>
        ) : (
          <>
            <SectionLabel>Calendar export</SectionLabel>
            <Card>
              <Text className="text-sm text-shell-dim">
                No feed generated yet. Generate a private link to subscribe to
                your bookings.
              </Text>
              <View className="mt-3">
                <Button
                  label="Generate feed link"
                  loading={pending === "generate"}
                  onPress={generate}
                />
              </View>
            </Card>
          </>
        )}

        {error ? (
          <Text className="mt-3 text-sm text-danger-fg">{error}</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
