import { useState } from "react";
import { Keyboard, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  SUPPORT_CATEGORY_LABELS,
  validateReplyBody,
  SUPPORT_LIMITS,
} from "@inklee/shared/support";
import type { MobileSupportTicketDetail } from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { TextArea } from "@/components/TextArea";
import { BrandLoader } from "@/components/BrandLoader";
import { ErrorState } from "@/components/ErrorState";
import { SupportStatusChip } from "@/components/support/SupportStatusChip";
import { useApiQuery, apiPost, invalidateByPathPrefix } from "@/lib/api";
import { formatShortDate, formatShortDateTime } from "@/lib/date";
import { captureError } from "@/lib/telemetry";

function ReportField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold uppercase tracking-wide text-shell-mute">
        {label}
      </Text>
      <Text className="mt-0.5 text-sm leading-relaxed text-foreground">
        {value}
      </Text>
    </View>
  );
}

export default function SupportTicketDetail() {
  const { id, created } = useLocalSearchParams<{
    id: string;
    created?: string;
  }>();
  const q = useApiQuery<MobileSupportTicketDetail>(`/support/${id}`);
  const queryClient = useQueryClient();

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <BrandLoader />
          ) : (
            <ErrorState
              title="Couldn't load ticket"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  const t = q.data;

  async function send() {
    const bodyError = validateReplyBody(reply);
    if (bodyError) {
      setError(bodyError);
      return;
    }
    Keyboard.dismiss();
    setSending(true);
    setError(null);
    try {
      await apiPost(`/support/${id}/reply`, { body: reply.trim() });
      setReply("");
      await q.refresh();
      // The list's unread flag + updated time change after a reply.
      await invalidateByPathPrefix(queryClient, ["/support"]);
    } catch (e) {
      captureError(e, { op: "replySupportTicket" });
      setError(e instanceof Error ? e.message : "Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen edges={["left", "right"]} column="form">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
      >
        <View className="mb-2 flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-xs font-mono text-shell-mute">
              {t.reference}
            </Text>
            <Text className="mt-0.5 text-xl font-semibold text-foreground">
              {t.subject}
            </Text>
            <Text className="mt-1 text-xs text-shell-dim">
              {SUPPORT_CATEGORY_LABELS[t.category]} · opened{" "}
              {formatShortDate(t.createdAt)} · last update{" "}
              {formatShortDate(t.updatedAt)}
            </Text>
          </View>
          <SupportStatusChip status={t.status} />
        </View>

        {created === "1" ? (
          <View className="mb-4 rounded-xl border border-mustard/50 bg-mustard/10 px-3 py-2">
            <Text className="text-sm text-foreground">
              Your request has been created. We will notify you when there is an
              update, and the full conversation stays here.
            </Text>
          </View>
        ) : null}

        <Card>
          <Text className="mb-3 text-xs font-semibold uppercase tracking-wide text-shell-mute">
            Your report
          </Text>
          <ReportField label="What is going wrong" value={t.description} />
          <ReportField label="Expected" value={t.expectedBehavior} />
          <ReportField label="Actually happened" value={t.actualBehavior} />
          <ReportField label="Steps to reproduce" value={t.reproductionSteps} />
          <ReportField label="Relevant page or feature" value={t.relevantArea} />
          <ReportField label="Device" value={t.deviceInfo} />
          <ReportField label="Browser or app" value={t.platformInfo} />
          <ReportField label="Additional context" value={t.additionalContext} />
        </Card>

        <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-shell-mute">
          Conversation
        </Text>
        {t.messages.length === 0 ? (
          <Text className="text-sm text-shell-dim">
            No replies yet. The Inklee team has been notified and will respond
            here.
          </Text>
        ) : (
          t.messages.map((m) => (
            <View
              key={m.id}
              className={`mb-2 rounded-2xl border border-shell-border bg-glass p-3 ${
                m.authorRole === "admin" ? "border-l-2 border-l-mustard" : ""
              }`}
            >
              <Text className="text-xs text-shell-dim">
                <Text className="font-semibold text-foreground">
                  {m.authorRole === "admin" ? "Inklee support" : "You"}
                </Text>{" "}
                · {formatShortDateTime(m.createdAt)}
              </Text>
              <Text className="mt-1 text-sm leading-relaxed text-foreground">
                {m.body}
              </Text>
            </View>
          ))
        )}

        <View className="mt-6 border-t border-shell-border pt-5">
          {t.canReply ? (
            <>
              {t.status === "resolved" ? (
                <Text className="mb-2 text-xs text-shell-dim">
                  This ticket is resolved. Sending a reply reopens it.
                </Text>
              ) : null}
              <TextArea
                value={reply}
                onChangeText={setReply}
                maxLength={SUPPORT_LIMITS.replyMax}
                placeholder="Write a reply"
                minHeight={80}
              />
              {error ? (
                <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
              ) : null}
              <Button label="Send reply" onPress={send} loading={sending} />
            </>
          ) : (
            <Text className="text-sm text-shell-dim">
              This ticket is closed. Open a new support request if you need more
              help.
            </Text>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
