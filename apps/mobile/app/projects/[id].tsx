import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileProjectDetail } from "@inklee/shared/mobile-api";
import {
  PROJECT_STATUS_META,
  PROJECT_TRANSITIONS,
  PROJECT_NOTE_MAX,
  BODY_AREAS,
  PROJECT_SCALES,
  SESSION_COMMITMENTS,
  CONSULTATION_METHODS,
  COVERAGE_LEVELS,
  labelForKey,
  budgetRangeLabel,
  type ProjectStatus,
} from "@inklee/shared/projects";
import { STYLE_SEED } from "@inklee/shared/map-directory";
import { formatMoneyShort } from "@inklee/shared/money";
import { humanStatusLabel } from "@inklee/shared/status-labels";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/ErrorState";
import { SectionLabel } from "@/components/SectionLabel";
import { TextArea } from "@/components/TextArea";
import {
  useApiQuery,
  apiPatch,
  invalidateByPathPrefix,
} from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";

// Native project detail (Plus build P4), the twin of the web detail page.
// Status changes and the private note both PATCH the same route, which calls
// the same cores the web actions use.

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="border-t border-shell-border py-2.5 first:border-t-0">
      <Text className="text-xs text-shell-mute">{label}</Text>
      <Text className="mt-0.5 text-sm text-foreground">{value}</Text>
    </View>
  );
}

export default function ProjectDetailScreen() {
  useScreenView("project_detail");
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const q = useApiQuery<MobileProjectDetail>(`/projects/${id}`);

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <ErrorState
              title="Couldn't load the project"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <ProjectDetail data={q.data} refresh={q.refresh} />;
}

function ProjectDetail({
  data,
  refresh,
}: {
  data: MobileProjectDetail;
  refresh: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const p = data.project;

  const [note, setNote] = useState(p.artist_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = PROJECT_STATUS_META[p.status as ProjectStatus];
  // Only the transitions the shared state machine permits, so a refusal is
  // never something the artist discovers by tapping.
  const next = PROJECT_TRANSITIONS[p.status as ProjectStatus] ?? [];
  const eur = (cents: number) => formatMoneyShort(cents, "EUR");

  async function patch(body: Record<string, unknown>) {
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/projects/${p.id}`, body);
      await invalidateByPathPrefix(queryClient, ["/projects"]);
      refresh();
    } catch (e) {
      captureError(e, { op: "updateProject" });
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
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
        <Text className="text-2xl font-semibold text-foreground">{p.title}</Text>
        <Text className="mt-1 mb-4 text-sm text-shell-dim">
          {meta?.label}. {meta?.description}
        </Text>

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <View className="mb-4 flex-row flex-wrap gap-2">
          {next.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void patch({ status: s })}
              className="rounded-full border border-shell-border px-3 py-2 active:opacity-70"
            >
              <Text className="text-xs font-medium text-accent">
                Move to {PROJECT_STATUS_META[s].label.toLowerCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        <SectionLabel>The enquiry</SectionLabel>
        <Card>
          <Row
            label="Client"
            value={
              p.customer_handle
                ? `${p.customer_email} · ${p.customer_handle}`
                : p.customer_email
            }
          />
          <Row label="What they want" value={p.description} />
          <Row label="Long-term goal" value={p.long_term_goal} />
          <Row
            label="Areas"
            value={
              p.body_areas
                .map((a) => labelForKey(BODY_AREAS, a))
                .filter(Boolean)
                .join(", ") || null
            }
          />
          <Row
            label="Existing coverage"
            value={labelForKey(COVERAGE_LEVELS, p.coverage)}
          />
          <Row label="Free areas" value={p.available_areas} />
          <Row
            label="Styles"
            value={
              p.styles
                .map((s) => labelForKey(STYLE_SEED, s))
                .filter(Boolean)
                .join(", ") || null
            }
          />
          <Row label="Scale" value={labelForKey(PROJECT_SCALES, p.scale)} />
          <Row
            label="Session commitment"
            value={labelForKey(SESSION_COMMITMENTS, p.session_commitment)}
          />
          <Row label="Travel" value={p.travel_availability} />
          <Row
            label="Budget"
            value={budgetRangeLabel(
              p.budget_min_cents,
              p.budget_max_cents,
              eur,
            )}
          />
          <Row
            label="Prefers to talk by"
            value={labelForKey(CONSULTATION_METHODS, p.consultation_method)}
          />
        </Card>

        {data.mediaUrls.length > 0 ? (
          <>
            <SectionLabel>Photos</SectionLabel>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {data.mediaUrls.map((url) => (
                <Image
                  key={url}
                  source={{ uri: url }}
                  className="h-24 w-24 rounded-xl"
                  resizeMode="cover"
                />
              ))}
            </View>
          </>
        ) : null}

        <SectionLabel>Sessions</SectionLabel>
        {data.sessions.length === 0 ? (
          <Text className="mb-3 text-sm text-shell-dim">
            No sessions attached yet.
          </Text>
        ) : (
          <Card>
            {data.sessions.map((s, i) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                onPress={() => router.push(`/bookings/${s.id}`)}
                className={`py-3 active:opacity-70 ${
                  i > 0 ? "border-t border-shell-border" : ""
                }`}
              >
                <Text className="text-sm text-foreground">
                  {s.preferredDate ?? "No date"} · {humanStatusLabel(s.status)}
                </Text>
              </Pressable>
            ))}
          </Card>
        )}

        <SectionLabel>Your notes</SectionLabel>
        <TextArea
          value={note}
          onChangeText={setNote}
          placeholder="Your own notes. The client never sees these."
          maxLength={PROJECT_NOTE_MAX}
        />
        <Button
          label="Save note"
          variant="secondary"
          loading={busy}
          onPress={() => void patch({ note })}
        />
      </ScrollView>
    </Screen>
  );
}
