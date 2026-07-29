import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileDiscountList } from "@inklee/shared/mobile-api";
import {
  DISCOUNT_CODE_MAX,
  discountLabel,
  normalizeDiscountCode,
  validateDiscountCode,
  type DiscountKind,
} from "@inklee/shared/discounts";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/ErrorState";
import { FieldLabel } from "@/components/FieldLabel";
import { RadioList } from "@/components/RadioList";
import { SectionLabel } from "@/components/SectionLabel";
import { TextField } from "@/components/TextField";
import {
  useApiQuery,
  apiPost,
  apiPatch,
  invalidateByPathPrefix,
} from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import { useColors } from "@/lib/theme";
import { useScreenView } from "@/lib/analytics";
import { planBoundaryMessage } from "@/lib/plan-errors";

// Discount codes, native (closing the P5b parity gap). Every write posts to a
// route that calls the same cores the web action uses, so the entitlement
// refusal, the duplicate-code handling and the unit conversion are one
// implementation.

const KIND_OPTIONS: readonly { value: DiscountKind; label: string }[] = [
  { value: "percent", label: "Percentage off" },
  { value: "fixed", label: "Fixed amount off" },
];

const eur = (minor: number) => `€${(minor / 100).toFixed(2)}`;

export default function DiscountsScreen() {
  useScreenView("goods_discounts");
  const c = useColors();
  const q = useApiQuery<MobileDiscountList>("/goods/discounts");

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <ErrorState
              title="Couldn't load your codes"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  return <DiscountsList data={q.data} refresh={q.refresh} />;
}

function DiscountsList({
  data,
  refresh,
}: {
  data: MobileDiscountList;
  refresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<DiscountKind>("percent");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    Keyboard.dismiss();
    const normalized = normalizeDiscountCode(code);
    // Validated with the SAME shared rules the server applies, so the artist
    // is told about a bad code before a round trip rather than after one.
    const codeError = validateDiscountCode(normalized);
    if (codeError) {
      setError(codeError);
      return;
    }
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter an amount above zero.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await apiPost("/goods/discounts", { code: normalized, kind, value: n });
      await invalidateByPathPrefix(queryClient, ["/goods/discounts"]);
      setCode("");
      setValue("");
      setAdding(false);
      refresh();
    } catch (e) {
      captureError(e, { op: "createDiscount" });
      setError(planBoundaryMessage(e, "Couldn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    setError(null);
    try {
      await apiPatch("/goods/discounts", { id, active });
      await invalidateByPathPrefix(queryClient, ["/goods/discounts"]);
      refresh();
    } catch (e) {
      captureError(e, { op: "toggleDiscount" });
      setError(planBoundaryMessage(e, "Couldn't save. Try again."));
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
        <Text className="mb-4 text-sm text-shell-dim">
          Codes apply to the goods in an order. They never come off a deposit.
        </Text>

        {!data.entitled ? (
          <Card>
            {/* No price and no purchase step: D17 keeps the app clear of
                anything that reads as steering toward a purchase. */}
            <Text className="text-sm text-shell-dim">
              Discount codes are part of Plus. Codes you already made are kept.
            </Text>
          </Card>
        ) : null}

        {error ? (
          <Text className="mb-3 text-sm text-danger-fg">{error}</Text>
        ) : null}

        <SectionLabel>Your codes</SectionLabel>
        {data.codes.length === 0 ? (
          <Text className="mb-3 text-sm text-shell-dim">No codes yet.</Text>
        ) : (
          <Card>
            {data.codes.map((d, i) => (
              <View
                key={d.id}
                className={`py-3 ${i > 0 ? "border-t border-shell-border" : ""} ${
                  d.active ? "" : "opacity-60"
                }`}
              >
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 text-base font-semibold text-foreground">
                    {d.code}
                  </Text>
                  <Text className="text-xs text-shell-mute">
                    {discountLabel(d, eur)}
                  </Text>
                </View>
                <Text className="mt-0.5 text-sm text-shell-dim">
                  {d.maxRedemptions
                    ? `${d.used} of ${d.maxRedemptions} used`
                    : `${d.used} used`}
                  {d.minSubtotalMinor > 0 &&
                    ` · minimum ${eur(d.minSubtotalMinor)}`}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void toggle(d.id, !d.active)}
                  hitSlop={8}
                  className="mt-2 active:opacity-70"
                >
                  <Text className="text-label font-medium text-accent">
                    {d.active ? "Switch off" : "Switch on"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </Card>
        )}

        {adding ? (
          <>
            <SectionLabel>New code</SectionLabel>
            <TextField
              label="Code"
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="SUMMER25"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={DISCOUNT_CODE_MAX}
              hint="Letters and numbers only."
            />
            <FieldLabel>Type</FieldLabel>
            <RadioList
              options={KIND_OPTIONS}
              value={kind}
              onChange={(v) => setKind(v as DiscountKind)}
            />
            <TextField
              label={kind === "percent" ? "Percent" : "Amount in euros"}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
            />
            <Button label="Create code" onPress={create} loading={busy} />
            <View className="mt-2">
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setAdding(false)}
              />
            </View>
          </>
        ) : (
          <View className="mt-4">
            <Button
              label="New code"
              variant="secondary"
              onPress={() => setAdding(true)}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
