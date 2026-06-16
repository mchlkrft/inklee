import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react-native";
import { Card } from "@/components/Card";
import { CardHeader } from "@/components/CardHeader";
import { Button } from "@/components/Button";
import {
  approveBooking,
  rejectBooking,
  markDepositReceived,
} from "@/lib/bookings";
import { invalidateBookingViews } from "@/lib/api";
import { captureError } from "@/lib/telemetry";
import type { MobileActionItem } from "@inklee/shared/mobile-api";

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount}`;
  }
}

function Pill({ label, tone }: { label: string; tone: "pending" | "overdue" | "awaiting" }) {
  const cls =
    tone === "overdue"
      ? "bg-danger/15"
      : tone === "pending"
        ? "bg-mustard/15"
        : "bg-glass";
  const text =
    tone === "overdue"
      ? "text-danger-fg"
      : tone === "pending"
        ? "text-accent"
        : "text-shell-dim";
  return (
    <View className={`shrink-0 rounded-full px-2 py-0.5 ${cls}`}>
      <Text className={`text-[11px] ${text}`}>{label}</Text>
    </View>
  );
}

// The ranked "Action required" feed on Home. Each row carries its inline verb
// (Accept / Pass for a request, Mark received for a manual deposit) reusing the
// shared booking mutations; on success we invalidate the booking views (incl.
// /home) so the acted row drops out. Pass is two-step (it emails a decline),
// matching the booking detail. Mirrors the web ActionFeed.
export function ActionFeed({ items }: { items: MobileActionItem[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setPendingKey(key);
    try {
      await fn();
      await invalidateBookingViews(queryClient);
    } catch (e) {
      captureError(e, { op: "homeAction" });
      setError(e instanceof Error ? e.message : "Couldn't update. Try again.");
    } finally {
      setPendingKey(null);
      setConfirmKey(null);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={Inbox}
        tint="mustard"
        title="Action required"
        trailing={
          <View className="rounded-full bg-glass px-2 py-0.5">
            <Text className="text-caption text-shell-dim">{items.length}</Text>
          </View>
        }
      />

      {items.map((item, i) => {
        const key = `${item.kind}-${item.bookingId}`;
        const busy = pendingKey === key;
        const border = i > 0 ? "border-t border-shell-border" : "";

        if (item.kind === "request") {
          const ctx = [item.placement, item.preferredDate]
            .filter(Boolean)
            .join(" · ");
          return (
            <View
              key={key}
              className={`mt-3 flex-row items-center gap-3 pt-3 ${border}`}
            >
              {/* Text column: Pending chip, client, then placement · date. */}
              <View className="flex-1">
                <View className="mb-1.5 flex-row">
                  <Pill label="Pending" tone="pending" />
                </View>
                <Text
                  className="text-body font-medium text-foreground"
                  numberOfLines={1}
                >
                  {item.client}
                </Text>
                {ctx ? (
                  <Text
                    className="mt-0.5 text-caption text-shell-dim"
                    numberOfLines={2}
                  >
                    {ctx}
                  </Text>
                ) : null}
              </View>
              {/* Inline verbs, vertically centered on the right. Pass is
                  two-step: it swaps to Confirm pass / Cancel in place. */}
              <View className="flex-row items-center gap-2">
                {confirmKey === key ? (
                  <>
                    <Button
                      label="Confirm pass"
                      variant="danger-outline"
                      size="sm"
                      loading={busy}
                      onPress={() =>
                        act(key, () => rejectBooking(item.bookingId))
                      }
                    />
                    <Button
                      label="Cancel"
                      variant="secondary"
                      size="sm"
                      onPress={() => setConfirmKey(null)}
                    />
                  </>
                ) : (
                  <>
                    <Button
                      label="Pass"
                      variant="secondary"
                      size="sm"
                      onPress={() => setConfirmKey(key)}
                    />
                    <Button
                      label="Accept"
                      size="sm"
                      loading={busy}
                      onPress={() =>
                        act(key, () => approveBooking(item.bookingId))
                      }
                    />
                  </>
                )}
              </View>
            </View>
          );
        }

        // deposit
        return (
          <View
            key={key}
            className={`mt-3 flex-row items-center gap-3 pt-3 ${border}`}
          >
            {/* Text column: status chip, client, then the amount due. */}
            <View className="flex-1">
              <View className="mb-1.5 flex-row">
                <Pill
                  label={item.overdue ? "Overdue deposit" : "Awaiting deposit"}
                  tone={item.overdue ? "overdue" : "awaiting"}
                />
              </View>
              <Text
                className="text-body font-medium text-foreground"
                numberOfLines={1}
              >
                {item.client}
              </Text>
              <Text className="mt-0.5 text-caption text-shell-dim">
                {money(item.amount, item.currency)}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Button
                label="Mark received"
                size="sm"
                loading={busy}
                onPress={() =>
                  act(key, () => markDepositReceived(item.bookingId))
                }
              />
            </View>
          </View>
        );
      })}

      {error ? (
        <Text className="mt-3 text-sm text-danger-fg">{error}</Text>
      ) : null}

      <Pressable
        onPress={() => router.navigate("/bookings")}
        hitSlop={8}
        className="mt-3 active:opacity-60"
      >
        <Text className="text-label text-shell-dim">View all in Bookings</Text>
      </Pressable>
    </Card>
  );
}
