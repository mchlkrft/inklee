import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { formatPrice, parsePriceInput } from "@inklee/shared/goods";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { RadioList } from "@/components/RadioList";
import { ErrorState } from "@/components/ErrorState";
import { apiPost, useApiQuery, ApiError } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { captureError } from "@/lib/telemetry";
import { useScreenView } from "@/lib/analytics";
import { planBoundaryMessage } from "@/lib/plan-errors";

// Native REVISE screen for an appointment payment request (FD12, closing the
// parity gap docs/web-native-parity.md named at the 2026-08-01 P9 entry: the
// app has had the write + read `/api/mobile/payments/requests` routes since
// A7, but no management screen at all). This mirrors
// `RevisePaymentRequestForm` on web feature-for-feature (load current values,
// edit permitted fields, recalculate the total, confirm before saving,
// conflict handling, entitlement + clear-error states) with native-appropriate
// controls (RadioList instead of a <select>, an Alert.alert confirm instead
// of a two-step inline control).
//
// REACHABILITY, stated rather than hidden: like the web revise route itself
// ("NOT yet in the nav... reachable by URL"), the app has no payment-request
// LIST/DETAIL screen yet to link this from, so today this route is reachable
// only by an explicit `router.push` (e.g. from a future list screen, or a
// deep link). The capability is not absent — the screen is complete and
// functional — but wiring a tap-to-reach entry point needs the native list
// screen, which is a separate, larger scope than this ticket named.

type Classification = "tattoo_service" | "additional_service";
type Collects = "deposit" | "balance" | "full_price";

type RequestLine = {
  id: string;
  name: string;
  quantity: number;
  unitAmountMinor: number;
  lineTotalMinor: number;
  classification: string;
};

type RequestDetail = {
  id: string;
  status: string;
  currency: string;
  totalMinor: number;
  revision: number;
  collects: string;
  lines: RequestLine[];
};

type LineDraft = {
  name: string;
  amount: string; // major units, e.g. "50.00"
  classification: Classification;
};

const COLLECTS_OPTIONS: { value: Collects; label: string }[] = [
  { value: "deposit", label: "Deposit" },
  { value: "balance", label: "Remaining balance" },
  { value: "full_price", label: "Full price" },
];

const CLASS_OPTIONS: { value: Classification; label: string }[] = [
  { value: "tattoo_service", label: "Tattoo service" },
  { value: "additional_service", label: "Additional service" },
];

function normalizeCollects(raw: string | undefined): Collects {
  return raw === "balance" || raw === "full_price" ? raw : "deposit";
}

export default function RevisePaymentRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useScreenView("payment_request_revise");
  const router = useRouter();
  const navigation = useNavigation();
  const colors = useColors();

  const detailQ = useApiQuery<{ request: RequestDetail }>(
    `/payments/requests/${id}`,
  );
  const req = detailQ.data?.request ?? null;

  const [collects, setCollects] = useState<Collects>("deposit");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [prefilled, setPrefilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Revise payment request" });
  }, [navigation]);

  // Prefill once from the request being revised, mirroring the web page's own
  // "starts from what the client was last shown" behaviour.
  useEffect(() => {
    if (req && !prefilled) {
      setCollects(normalizeCollects(req.collects));
      setLines(
        req.lines.length > 0
          ? req.lines.map((l) => ({
              name: l.name,
              amount: (l.unitAmountMinor / 100).toFixed(2),
              classification:
                l.classification === "additional_service"
                  ? "additional_service"
                  : "tattoo_service",
            }))
          : [{ name: "", amount: "", classification: "tattoo_service" }],
      );
      setPrefilled(true);
    }
  }, [req, prefilled]);

  function patchLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }
  function addLine() {
    setLines((prev) => [
      ...prev,
      { name: "", amount: "", classification: "tattoo_service" },
    ]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  // Recalculated on every render from the current draft, so the total on
  // screen never lags what will actually be sent.
  const built: {
    name: string;
    unitAmountMinor: number;
    quantity: number;
    classification: Classification;
  }[] = [];
  let totalMinor = 0;
  let validationError: string | null = null;
  for (const l of lines) {
    const name = l.name.trim();
    const parsed = parsePriceInput(l.amount);
    if (!name || "error" in parsed || parsed.value <= 0) {
      validationError = "Give every line a name and a positive amount.";
      continue;
    }
    const minor = Math.round(parsed.value * 100);
    totalMinor += minor;
    built.push({
      name,
      unitAmountMinor: minor,
      quantity: 1,
      classification: l.classification,
    });
  }

  function confirmAndSubmit() {
    setError(null);
    if (validationError || built.length === 0) {
      setError(validationError ?? "Add at least one line.");
      return;
    }
    Alert.alert(
      "Create this revision?",
      `This starts a new version of the request for ${formatPrice(
        totalMinor / 100,
        req?.currency ?? "eur",
      )}. The current one stays live for your client until you send this revision.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Create revision", onPress: doSubmit },
      ],
    );
  }

  async function doSubmit() {
    setSubmitting(true);
    setError(null);
    setConflict(false);
    try {
      await apiPost<{ id: string; status: string }>(
        `/payments/requests/${id}/revise`,
        { collects, lines: built },
      );
      // No native payment-request DETAIL screen exists yet (see the header
      // note), so there is nowhere to navigate FORWARD to. Back is the one
      // navigation that is always correct regardless of the entry point.
      router.back();
    } catch (e) {
      captureError(e, { op: "revisePaymentRequest" });
      if (e instanceof ApiError && e.code === "settled") {
        // CONFLICT: the request changed under the artist (already sent past
        // revision, or settled) between load and submit.
        setConflict(true);
        setError(
          "This request has moved on since you opened it, so it can no longer be revised this way. Reload to see its current state.",
        );
      } else if (e instanceof ApiError && e.code === "not_found") {
        setError("This payment request no longer exists.");
      } else {
        setError(planBoundaryMessage(e, "Couldn't create the revision."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (detailQ.error) {
    return (
      <Screen edges={["left", "right"]}>
        <ErrorState
          title="Couldn't load this payment request"
          subtitle={detailQ.error}
          onRetry={detailQ.refresh}
        />
      </Screen>
    );
  }
  if (!req) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right"]} column="form">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text className="mb-1 text-sm text-shell-dim">
          Revision {req.revision} → {req.revision + 1}
        </Text>
        <Text className="mb-4 text-sm text-shell-dim">
          This starts a new version of the request. The current one stays live
          for your client until you send this revision.
        </Text>

        <Text className="mb-1.5 text-sm font-medium text-foreground">
          Collecting
        </Text>
        <RadioList
          options={COLLECTS_OPTIONS}
          value={collects}
          onChange={setCollects}
        />

        <Text className="mb-1.5 mt-2 text-sm font-medium text-foreground">
          Line items
        </Text>
        {lines.map((l, i) => (
          <Card key={i}>
            <View className="gap-2">
              <TextField
                value={l.name}
                onChangeText={(v) => patchLine(i, { name: v })}
                placeholder="Description (e.g. Deposit)"
              />
              <TextField
                value={l.amount}
                onChangeText={(v) => patchLine(i, { amount: v })}
                placeholder="0.00"
                keyboardType="decimal-pad"
                accessibilityLabel="Amount"
              />
              <RadioList
                options={CLASS_OPTIONS}
                value={l.classification}
                onChange={(v) => patchLine(i, { classification: v })}
              />
              {lines.length > 1 ? (
                <Button
                  label="Remove line"
                  variant="danger-outline"
                  size="xs"
                  onPress={() => removeLine(i)}
                />
              ) : null}
            </View>
          </Card>
        ))}
        <View className="mb-4 mt-1">
          <Button label="Add line" variant="secondary" size="sm" onPress={addLine} />
        </View>

        <Text className="mb-3 text-base font-semibold text-foreground">
          New total: {formatPrice(totalMinor / 100, req.currency)}
        </Text>

        {error ? (
          <Text className="mb-2 text-sm text-danger-fg">{error}</Text>
        ) : null}

        {conflict ? (
          <View className="mb-3">
            <Button
              label="Reload"
              variant="secondary"
              onPress={() => {
                setConflict(false);
                setPrefilled(false);
                detailQ.refresh();
              }}
            />
          </View>
        ) : (
          <Button
            label={submitting ? "Creating..." : "Create revision"}
            onPress={confirmAndSubmit}
            loading={submitting}
          />
        )}
      </ScrollView>
    </Screen>
  );
}
