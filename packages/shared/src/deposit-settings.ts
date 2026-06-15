// Per-artist deposit defaults. Stored in `profiles.settings.deposit_defaults`
// JSONB so we don't need a migration — same pattern as dashboard widgets and
// cover image / colour. The fields here pre-fill the per-booking deposit form
// in `bookings/requests/[id]/status-actions.tsx`; they are NOT a hard config
// (the artist can still override every field per request).

export type DepositDefaults = {
  /** Default deposit amount in EUR. `null` = leave empty, force per-request entry. */
  amount: number | null;
  /** Days from "today" to pre-fill the due date. */
  due_days: number;
  /** Default note shown to the customer in the deposit-request email. */
  note: string;
};

export const DEPOSIT_DEFAULTS_FALLBACK: DepositDefaults = {
  amount: null,
  due_days: 7,
  note: "",
};

const MAX_AMOUNT = 100_000;
const MAX_DUE_DAYS = 90;
const MAX_NOTE = 300;

export function parseDepositDefaults(raw: unknown): DepositDefaults {
  if (!raw || typeof raw !== "object") return DEPOSIT_DEFAULTS_FALLBACK;
  const obj = raw as Record<string, unknown>;

  let amount: number | null = null;
  if (typeof obj.amount === "number" && Number.isFinite(obj.amount)) {
    amount = Math.max(0, Math.min(MAX_AMOUNT, obj.amount));
    if (amount === 0) amount = null;
  }

  let due_days = DEPOSIT_DEFAULTS_FALLBACK.due_days;
  if (typeof obj.due_days === "number" && Number.isFinite(obj.due_days)) {
    due_days = Math.max(1, Math.min(MAX_DUE_DAYS, Math.round(obj.due_days)));
  }

  const note = typeof obj.note === "string" ? obj.note.slice(0, MAX_NOTE) : "";

  return { amount, due_days, note };
}

/** Stripe-mode classification used to drive UI status + the test-mode banner. */
export type StripeMode = "live" | "test" | "missing";

export function detectStripeMode(
  publishableKey: string | null | undefined,
): StripeMode {
  if (!publishableKey) return "missing";
  if (publishableKey.startsWith("pk_live_")) return "live";
  if (publishableKey.startsWith("pk_test_")) return "test";
  return "missing";
}
